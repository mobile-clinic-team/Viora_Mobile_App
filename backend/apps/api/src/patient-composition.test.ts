import assert from 'node:assert/strict';
import test from 'node:test';
import { getPatient, listPatients, PatientApplicationError } from '../../../libs/patient/application-entrypoint/src/index.ts';
import type { Patient } from '../../../libs/patient/domain/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { createPatientApplicationDependencies, createPatientDirectoryDependencies, type PatientRuntimeDependencies } from './patient-composition.ts';

const context = createAuthenticatedRequestContext({
  requestId: 'request-1', correlationId: 'correlation-1', userId: 'user-1',
  subject: 'subject-1', tenantId: 'tenant-1', membershipId: 'membership-1',
  permissionRevision: '"1"', roles: ['CLINIC_ADMIN'],
});

const patient: Patient = {
  patientId: 'patient-1', tenantId: 'tenant-1', userId: null,
  medicalRecordNumber: 'test-mrn', fullName: 'Test Patient', dateOfBirth: '1990-01-01',
  sex: 'UNKNOWN', status: 'ACTIVE', phone: '', email: '', address: '',
  emergencyContact: '', version: 1n, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z',
};

function fixture() {
  const reads: unknown[] = [];
  const unexpected = async (): Promise<never> => { throw new Error('unexpected mutation or idempotency access'); };
  const runtime: PatientRuntimeDependencies = {
    patientDirectoryCursor: null,
    patients: {
      searchDirectory: unexpected,
      async findById(input) { reads.push(input); return patient; },
      async listByTenant(input) { reads.push(input); return [patient]; },
      findByMedicalRecordNumber: unexpected,
      create: unexpected,
      update: unexpected,
    },
    idempotency: { lookup: unexpected, begin: unexpected, complete: unexpected, fail: unexpected },
  };
  return { runtime, reads };
}

for (const [label, grants, allowed] of [
  ['exact read grant', ['patient.read'], true],
  ['no grants', [], false],
  ['unrelated grant', ['appointment.read'], false],
  ['create grant', ['patient.create'], false],
  ['update grant', ['patient.update'], false],
  ['case variants', ['Patient.read', 'patient.READ'], false],
  ['whitespace and wildcard variants', [' patient.read', 'patient.read ', 'patient.*', '*'], false],
  ['role names', ['ADMIN', 'CLINICIAN', 'DOCTOR', 'NURSE'], false],
] as const) {
  test(`Patient composition read authorization: ${label}`, () => {
    const { runtime, reads } = fixture();
    const dependencies = createPatientApplicationDependencies(runtime, new Set<string>(grants));
    assert.equal(dependencies.authorization.allows({ action: 'patient.read', context }), allowed);
    assert.deepEqual(reads, []);
  });
}

test('composition preserves runtime instances and keeps authorization independent per request', () => {
  const { runtime } = fixture();
  const allowed = createPatientApplicationDependencies(runtime, new Set(['patient.read']));
  const denied = createPatientApplicationDependencies(runtime, new Set());
  for (const dependencies of [allowed, denied]) {
    assert.equal(dependencies.patients, runtime.patients);
    assert.equal(dependencies.idempotency, runtime.idempotency);
  }
  assert.notEqual(allowed.authorization, denied.authorization);
  assert.equal(allowed.authorization.allows({ action: 'patient.read', context }), true);
  assert.equal(denied.authorization.allows({ action: 'patient.read', context }), false);
  assert.equal(allowed.authorization.allows({ action: 'patient.read', context }), true);
});

test('directory composition preserves runtime protection and request-scoped exact grants', () => {
  const { runtime } = fixture();
  const allowed = createPatientDirectoryDependencies(runtime, new Set(['patient.read']));
  const denied = createPatientDirectoryDependencies(runtime, new Set());
  assert.equal(allowed.patients, runtime.patients);
  assert.equal(allowed.patientDirectoryCursor, runtime.patientDirectoryCursor);
  assert.notEqual(allowed.authorization, denied.authorization);
  assert.equal(allowed.authorization.allows({ action: 'patient.read', context }), true);
  assert.equal(denied.authorization.allows({ action: 'patient.read', context }), false);
});

test('P03 checks patient.read before repository access and again with the loaded Patient', async () => {
  const { runtime, reads } = fixture();
  const checks: (Patient | undefined)[] = [];
  const dependencies = {
    ...runtime,
    authorization: { allows(input: { action: string; patient?: Patient }) {
      assert.equal(input.action, 'patient.read');
      checks.push(input.patient);
      assert.equal(reads.length, input.patient ? 1 : 0);
      return input.patient === undefined;
    } },
  };
  await assert.rejects(getPatient(dependencies, context, patient.patientId), /FORBIDDEN/);
  assert.deepEqual(checks, [undefined, patient]);
  assert.equal(reads.length, 1);
});

test('composed patient.read reaches tenant-scoped get/list without idempotency access', async () => {
  const { runtime, reads } = fixture();
  const dependencies = createPatientApplicationDependencies(runtime, new Set(['patient.read']));
  assert.equal(await getPatient(dependencies, context, patient.patientId), patient);
  assert.deepEqual(await listPatients(dependencies, context, { limit: 5 }), [patient]);
  assert.deepEqual(reads, [
    { tenantId: 'tenant-1', patientId: 'patient-1' },
    { tenantId: 'tenant-1', limit: 5, medicalRecordNumber: undefined, fullName: undefined,
      dateOfBirth: undefined, phone: undefined, email: undefined, cursor: undefined },
  ]);
});

test('composed dependencies deny get/list before repository access without patient.read', async () => {
  const { runtime, reads } = fixture();
  const dependencies = createPatientApplicationDependencies(runtime, new Set(['patient.create', 'patient.update']));
  const forbidden = (error: unknown) => error instanceof PatientApplicationError && error.code === 'FORBIDDEN';
  await assert.rejects(getPatient(dependencies, context, patient.patientId), forbidden);
  await assert.rejects(listPatients(dependencies, context, {}), forbidden);
  assert.deepEqual(reads, []);
});
