import assert from 'node:assert/strict';
import test from 'node:test';
import { coordinatePatientCreate, type PatientCreateCommandDependencies } from './patient-create-coordinator.ts';
import { PatientCommandError } from './patient-create-operation-contract.ts';
import { PatientMedicalRecordNumberConflictError } from '../../../libs/patient/domain/src/repository-ports.ts';
import type { OperationRecord } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';

const now = new Date('2026-09-21T00:00:00.000Z');
const id = '11111111-1111-4111-8111-111111111111';
const input = { tenantId: id, actorId: id, key: id, timestamp: now.toISOString(), body: { fullName: 'Synthetic' } };
function fixture() {
  let record: OperationRecord | undefined;
  const events: string[] = [];
  const dependencies: PatientCreateCommandDependencies = {
    authorize: async () => { events.push('authorize'); },
    authorizeReplay: async () => { events.push('reauthorize'); },
    auditReplay: async () => { events.push('operation.replayed'); },
    operations: {
      async admit(intent) {
        events.push('admit');
        if (record) return { record, kind: record.requestFingerprint !== intent.requestFingerprint ? 'CONFLICT'
          : record.status === 'PROCESSING' ? 'IN_PROGRESS' : 'REPLAY' };
        record = { ...intent, operationId: id, status: 'PROCESSING', resultResourceType: null,
          resultResourceId: null, resultResourceVersion: null, resultHttpStatus: null,
          failureCode: null, createdAt: now, updatedAt: now };
        return { kind: 'STARTED', record };
      },
      async fail(_, failure) {
        events.push('fail');
        record = { ...record!, ...failure, status: 'FAILED' };
        return record;
      },
    },
    validate: () => {
      events.push('validate');
      return { userId: null, medicalRecordNumber: 'SYNTHETIC', fullName: 'Synthetic',
        dateOfBirth: '2000-01-01', sex: 'UNKNOWN', status: 'ACTIVE', phone: '', email: '', address: '', emergencyContact: '' };
    },
    settle: async () => {
      events.push('patient.created');
      record = { ...record!, status: 'SUCCEEDED', resultResourceType: 'PATIENT',
        resultResourceId: id, resultResourceVersion: 1n, resultHttpStatus: 201 };
      return record;
    },
  };
  return { dependencies, events };
}

test('same intent returns original 201 receipt with reauthorization/audit and no duplicate mutation', async () => {
  const { dependencies, events } = fixture();
  const first = await coordinatePatientCreate(dependencies, input, now);
  const replay = await coordinatePatientCreate(dependencies, input, now);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(first.receipt, replay.receipt);
  assert.equal(replay.status, 201);
  assert.deepEqual(events, ['authorize', 'admit', 'validate', 'patient.created', 'authorize', 'admit', 'reauthorize', 'operation.replayed']);
  await assert.rejects(coordinatePatientCreate(dependencies, { ...input, body: { fullName: 'changed' } }, now), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('deterministic FAILED repeat retains original failure without validation or side effects', async () => {
  const { dependencies, events } = fixture();
  dependencies.validate = () => { events.push('validate'); throw new PatientCommandError('VALIDATION_ERROR', 422); };
  for (let i = 0; i < 2; i++) await assert.rejects(coordinatePatientCreate(dependencies, input, now), { code: 'VALIDATION_ERROR', status: 422 });
  assert.equal(events.filter(e => e === 'validate').length, 1);
  assert.equal(events.filter(e => e === 'fail').length, 1);
  assert.equal(events.includes('patient.created'), false);
});

test('unknown transaction outcome stays pending and repeat cannot settle again', async () => {
  const { dependencies, events } = fixture();
  dependencies.settle = async () => { throw new Error('connection lost'); };
  await assert.rejects(coordinatePatientCreate(dependencies, input, now), { message: 'connection lost' });
  await assert.rejects(coordinatePatientCreate(dependencies, input, now), { code: 'OPERATION_IN_PROGRESS' });
  assert.equal(events.includes('fail'), false);
});

test('MRN conflict is settled FAILED and replayed as 409', async () => {
  const { dependencies, events } = fixture();
  dependencies.settle = async () => { throw new PatientMedicalRecordNumberConflictError(); };
  for (let i = 0; i < 2; i++) await assert.rejects(coordinatePatientCreate(dependencies, input, now), { code: 'CONFLICT', status: 409 });
  assert.equal(events.filter(e => e === 'fail').length, 1);
});

test('revoked replay authority and audit failure prevent receipt disclosure', async () => {
  for (const stage of ['authorize', 'authorizeReplay', 'auditReplay'] as const) {
    const { dependencies, events } = fixture();
    await coordinatePatientCreate(dependencies, input, now);
    dependencies[stage] = async () => { throw new PatientCommandError('FORBIDDEN', 403); };
    await assert.rejects(coordinatePatientCreate(dependencies, input, now), { code: 'FORBIDDEN' });
    assert.equal(events.filter(e => e === 'patient.created').length, 1);
  }
});
