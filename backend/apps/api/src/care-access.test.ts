import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { readEncounter, readClinicalRecord, readClinicalVersion, readClinicalHistory, readPatientEncounters } from '../../../libs/clinical/application-entrypoint/src/index.ts';
import { createDomainReadDependencies, createDomainReadRuntime } from './domain-read-composition.ts';
import { createPatientAuthorization } from './patient-authorization.ts';

const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
function fixture(role: string) {
  const context = createAuthenticatedRequestContext({ requestId: 'r', correlationId: 'c', userId: id,
    subject: 's', tenantId: id, membershipId: id, permissionRevision: '"1"', roles: [role] });
  let state: unknown = false;
  let row = { id, tenant_id: id, patient_id: id, encounter_id: id, current_version: '1' };
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const database: TransactionalDatabase = {
    async query<Row extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) {
      calls.push({ sql, values });
      const rows = sql.includes('SELECT EXISTS') ? [{ allowed: state }] : sql.includes('medical_record_versions')
        ? [{ id, medical_record_id: id, version: '1', diagnosis: 'Synthetic' }] : [row];
      return { rows: rows as unknown as Row[] };
    }, async transaction(work) { return work(database); }, async close() {},
  };
  const runtime = createDomainReadRuntime(database, '12'.repeat(32));
  const grants = new Set(['patient.read', 'encounter.read', 'record.read']);
  return { context, runtime, grants, calls, state: (value: unknown) => { state = value; },
    row: (value: typeof row) => { row = value; }, clinical: () => createDomainReadDependencies(runtime, grants).clinical };
}

test('Doctor Patient resource authorization loads durable same-workspace state on every check', async () => {
  const f = fixture('DOCTOR');
  const authorization = createPatientAuthorization(f.grants, f.runtime.careAccess);
  const input = { action: 'patient.read' as const, context: f.context, patient: { patientId: id, tenantId: id } as never };
  assert.equal(await authorization.allows(input), false);
  f.state(true);
  assert.equal(await authorization.allows(input), true);
  assert.deepEqual(f.calls.at(-1)?.values, [id, id, id, 'DOCTOR_RELATIONSHIP', id]);
  f.state(false); // explicit revocation affects the very next request/check
  assert.equal(await authorization.allows(input), false);
  f.state(true);
  assert.equal(await authorization.allows({ ...input, patient: { patientId: id, tenantId: other } as never }), false);
  f.grants.clear();
  assert.equal(await authorization.allows(input), false);
});

test('Nurse demographic read does not require assignment; unknown stored results fail closed', async () => {
  const f = fixture('NURSE');
  assert.equal(await createPatientAuthorization(f.grants, f.runtime.careAccess).allows({
    action: 'patient.read', context: f.context, patient: { patientId: id, tenantId: id } as never }), true);
  assert.equal(f.calls.length, 0);
  for (const state of [false, null, undefined, 'ACTIVE', 'true', 1, {}]) {
    f.state(state);
    await assert.rejects(readEncounter(f.clinical(), f.context, id), /FORBIDDEN/);
  }
});

for (const role of ['DOCTOR', 'NURSE']) test(`${role} clinical reads require live durable state, exact grant and canonical Patient linkage`, async () => {
  const f = fixture(role);
  const reads = [() => readEncounter(f.clinical(), f.context, id),
    () => readPatientEncounters(f.clinical(), f.context, id, {}),
    () => readClinicalRecord(f.clinical(), f.context, id),
    () => readClinicalVersion(f.clinical(), f.context, id, id),
    () => readClinicalHistory(f.clinical(), f.context, id, {})];
  for (const read of reads) await assert.rejects(read(), /FORBIDDEN/);
  f.state(true);
  for (const read of reads) await read();
  const checks = f.calls.filter(call => call.sql.includes('SELECT EXISTS'));
  assert.ok(checks.every(call => call.values[3] === (role === 'DOCTOR' ? 'DOCTOR_RELATIONSHIP' : 'NURSE_ASSIGNMENT')));
  f.state(false);
  for (const read of reads) await assert.rejects(read(), /FORBIDDEN/);
  f.state(true);
  f.row({ id, tenant_id: other, patient_id: id, encounter_id: id, current_version: '1' });
  await assert.rejects(reads[0]!(), /FORBIDDEN/);
  f.row({ id, tenant_id: id, patient_id: '', encounter_id: id, current_version: '1' });
  await assert.rejects(reads[0]!(), /FORBIDDEN/);
  f.grants.clear();
  await assert.rejects(reads[0]!(), /FORBIDDEN/);
});

test('Patient encounter list cannot authorize from requested Patient ID when no canonical row exists', async () => {
  const f = fixture('NURSE'); f.state(true);
  const deps = { ...f.clinical(), encounters: { ...f.runtime.encounters,
    findById: f.runtime.encounters.findById.bind(f.runtime.encounters), async listByPatient() { return []; } } };
  await assert.rejects(readPatientEncounters(deps, f.context, id, {}), /FORBIDDEN/);
});

test('Admin, Receptionist and unclassified roles cannot use persisted clinical links', async () => {
  for (const role of ['CLINIC_ADMIN', 'RECEPTIONIST', 'UNKNOWN']) {
    const f = fixture(role); f.state(true);
    await assert.rejects(readEncounter(f.clinical(), f.context, id), /FORBIDDEN/);
    assert.equal(f.calls.some(call => call.sql.includes('SELECT EXISTS')), false);
  }
});
