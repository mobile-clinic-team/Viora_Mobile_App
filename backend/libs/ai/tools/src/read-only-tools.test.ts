import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedRequestContext } from '../../../platform/context/src/index.ts';
import type { PatientSummary } from '../../../patient/contracts/src/index.ts';
import type { EncounterSummary } from '../../../clinical/contracts/src/index.ts';
import { createReadOnlyPatientTool, createReadOnlyRecentEncountersTool, type ReadOnlyToolLoaders } from './read-only-tools.ts';

const context = createAuthenticatedRequestContext({
  requestId: 'request-read', correlationId: 'correlation-read', userId: 'user-a', subject: 'subject-a',
  tenantId: 'tenant-a', membershipId: 'membership-a',
  permissionRevision: '"1"',
});

const patient = {
  patientId: 'patient-a', tenantId: 'tenant-a', userId: null, medicalRecordNumber: 'MRN-1', fullName: 'A',
  dateOfBirth: '2000-01-01', sex: 'F', phone: 'private', email: 'private', address: 'private',
  emergencyContact: 'private', status: 'ACTIVE', version: 1n, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

const encounter = {
  encounterId: 'encounter-a', tenantId: 'tenant-a', patientId: 'patient-a', appointmentId: null, doctorId: 'doctor-a',
  startedAt: '2026-01-01T10:00:00Z', endedAt: null, status: 'OPEN', createdAt: '2026-01-01', updatedAt: '2026-01-01',
} as const;

function loaders() {
  return {
    async getPatient() { return patient; },
    async listEncounters() { return [encounter, { ...encounter, encounterId: 'encounter-b', tenantId: 'tenant-b' }]; },
  };
}

test('get_patient returns minimum necessary fields only', async () => {
  const tool = createReadOnlyPatientTool(loaders());
  const output = await tool.execute({ patientId: ' patient-a ' }, context);
  assert.deepEqual(output, { patientId: 'patient-a', medicalRecordNumber: 'MRN-1', fullName: 'A', dateOfBirth: '2000-01-01', sex: 'F', status: 'ACTIVE' });
  assert.equal('phone' in output, false);
});

test('get_recent_encounters filters tenant and bounds results', async () => {
  const tool = createReadOnlyRecentEncountersTool(loaders());
  const output = await tool.execute({ patientId: 'patient-a', limit: 20 }, context);
  assert.deepEqual(output, [{ encounterId: 'encounter-a', patientId: 'patient-a', doctorId: 'doctor-a', startedAt: '2026-01-01T10:00:00Z', endedAt: null, status: 'OPEN' }]);
});

test('read-only tools reject malformed or excessive input', () => {
  const patientTool = createReadOnlyPatientTool(loaders());
  const encounterTool = createReadOnlyRecentEncountersTool(loaders());
  assert.equal(patientTool.validateInput({ patientId: 'x', extra: true }), false);
  assert.equal(encounterTool.validateInput({ patientId: 'x', limit: 21 }), false);
});

test('resource authorization matches the requested patient', () => {
  const tool = createReadOnlyPatientTool(loaders());
  assert.equal(tool.authorize?.({ context, toolInput: { patientId: 'patient-a' }, resource: { resourceId: 'patient-b', tenantId: 'tenant-a', resourceType: 'patient' } }), false);
});

test('read-only tools accept public summaries without requiring private entity fields', async () => {
  const patientSummary: PatientSummary = {
    patientId: 'patient-a', tenantId: 'tenant-a', medicalRecordNumber: 'MRN-1',
    fullName: 'A', dateOfBirth: '2000-01-01', sex: 'F', status: 'ACTIVE',
  };
  const encounterSummary: EncounterSummary = {
    encounterId: 'encounter-a', tenantId: 'tenant-a', patientId: 'patient-a', doctorId: 'doctor-a',
    startedAt: '2026-01-01T10:00:00Z', endedAt: null, status: 'OPEN',
  };
  const summaryLoaders: ReadOnlyToolLoaders = {
    async getPatient(input) {
      assert.strictEqual(input.context, context);
      assert.equal(input.patientId, 'patient-a');
      return patientSummary;
    },
    async listEncounters(input) {
      assert.strictEqual(input.context, context);
      assert.equal(input.patientId, 'patient-a');
      assert.equal(input.limit, 20);
      return [encounterSummary];
    },
  };
  const patientOutput = await createReadOnlyPatientTool(summaryLoaders).execute({ patientId: ' patient-a ' }, context);
  const encounterOutput = await createReadOnlyRecentEncountersTool(summaryLoaders).execute({ patientId: ' patient-a ' }, context);
  assert.deepEqual(patientOutput, await createReadOnlyPatientTool(loaders()).execute({ patientId: 'patient-a' }, context));
  assert.deepEqual(encounterOutput, await createReadOnlyRecentEncountersTool(loaders()).execute({ patientId: 'patient-a' }, context));
  assert.equal('tenantId' in patientOutput, false);
  assert.equal('tenantId' in encounterOutput[0], false);
});

test('encounter summaries keep tenant and patient filtering before the result limit', async () => {
  const tool = createReadOnlyRecentEncountersTool({
    ...loaders(),
    async listEncounters() {
      return [
        { ...encounter, encounterId: 'wrong-tenant', tenantId: 'tenant-b' },
        { ...encounter, encounterId: 'wrong-patient', patientId: 'patient-b' },
        encounter,
        { ...encounter, encounterId: 'encounter-c' },
      ];
    },
  });
  const output = await tool.execute({ patientId: ' patient-a ', limit: 1 }, context);
  assert.deepEqual(output.map(({ encounterId }) => encounterId), ['encounter-a']);
});
