import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  createPatient,
  getPatient,
  listPatients,
  patchPatient,
  PatientApplicationError,
  type PatientApplicationDependencies,
} from './index.ts';
import type { Patient, PatientCreate, PatientProfileChanges } from '../../domain/src/index.ts';
import type { PatientRepository } from '../../domain/src/repository-ports.ts';
import type { IdempotencyRecord, IdempotencyStore } from '../../../platform/idempotency/src/index.ts';
import { createAuthenticatedRequestContext, createUnauthenticatedRequestContext } from '../../../platform/context/src/index.ts';

const context = createAuthenticatedRequestContext({
  requestId: 'request-a', correlationId: 'correlation-a', userId: 'user-a',
  subject: 'subject-a', tenantId: 'tenant-a', membershipId: 'membership-a',
  permissionRevision: '"1"',
});

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    patientId: 'patient-a', tenantId: 'tenant-a', userId: null,
    medicalRecordNumber: 'MRN-A', fullName: 'Synthetic Patient A', dateOfBirth: '1990-01-01',
    sex: 'UNKNOWN', phone: '0000000000', email: 'patient-a@example.test',
    address: 'Synthetic address', emergencyContact: 'Synthetic contact', status: 'ACTIVE',
    version: 1n, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z',
    ...overrides,
  };
}

class MemoryPatients implements PatientRepository {
  public readonly items = new Map<string, Patient>([['patient-a', patient()]]);

  public async findById(input: { readonly tenantId: string; readonly patientId: string }): Promise<Patient | null> {
    const result = this.items.get(input.patientId);
    return result?.tenantId === input.tenantId ? result : null;
  }

  public async findByMedicalRecordNumber(input: { readonly tenantId: string; readonly medicalRecordNumber: string }): Promise<Patient | null> {
    return [...this.items.values()].find((item) => item.tenantId === input.tenantId && item.medicalRecordNumber === input.medicalRecordNumber) ?? null;
  }

  public async listByTenant(input: Parameters<PatientRepository['listByTenant']>[0]): Promise<readonly Patient[]> {
    return [...this.items.values()].filter((item) => item.tenantId === input.tenantId).slice(0, input.limit);
  }

  public async create(input: { readonly tenantId: string; readonly patient: PatientCreate }): Promise<Patient> {
    const created = patient({ ...input.patient, patientId: 'patient-created', tenantId: input.tenantId });
    this.items.set(created.patientId, created);
    return created;
  }

  public async update(input: { readonly tenantId: string; readonly patientId: string; readonly changes: PatientProfileChanges; readonly expectedVersion: bigint }): Promise<Patient | null> {
    const current = await this.findById(input);
    if (!current || current.version !== input.expectedVersion) return null;
    const updated = { ...current, ...input.changes, version: current.version + 1n };
    this.items.set(updated.patientId, updated);
    return updated;
  }
}

class MemoryIdempotency implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();
  private key(input: { readonly tenantId: string; readonly actorId: string; readonly endpoint: string; readonly key: string }): string {
    return [input.tenantId, input.actorId, input.endpoint, input.key].join('|');
  }
  public async lookup(input: Parameters<IdempotencyStore['lookup']>[0]) {
    const record = this.records.get(this.key(input));
    if (!record) return { kind: 'NEW' as const };
    return record.requestHash === input.requestHash ? { kind: 'REPLAY' as const, record } : { kind: 'CONFLICT' as const, record };
  }
  public async begin(input: Parameters<IdempotencyStore['begin']>[0]) {
    const lookup = await this.lookup(input);
    if (lookup.kind !== 'NEW') return lookup;
    const record: IdempotencyRecord = { ...input, status: 'PROCESSING', responseCode: null, responseReference: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) };
    this.records.set(this.key(input), record);
    return { kind: 'STARTED' as const, record };
  }
  public async complete(input: Parameters<IdempotencyStore['complete']>[0]) {
    const record = this.records.get(this.key(input))!;
    const complete = { ...record, status: 'SUCCEEDED' as const, responseCode: input.responseCode, responseReference: input.responseReference };
    this.records.set(this.key(input), complete);
    return complete;
  }
  public async fail(input: Parameters<IdempotencyStore['fail']>[0]) {
    const record = this.records.get(this.key(input))!;
    const failed = { ...record, status: 'FAILED' as const, responseCode: input.responseCode ?? null, responseReference: input.responseReference ?? null };
    this.records.set(this.key(input), failed);
    return failed;
  }
}

function dependencies(): PatientApplicationDependencies {
  return { patients: new MemoryPatients(), idempotency: new MemoryIdempotency(), authorization: { allows: () => true } };
}

const createInput = {
  medicalRecordNumber: 'MRN-C', fullName: 'Synthetic Patient C', dateOfBirth: '1991-01-01',
  sex: 'UNKNOWN', phone: '0000000001', email: 'patient-c@example.test',
  address: 'Synthetic address', emergencyContact: 'Synthetic contact',
};

test('creates once and replays the original patient for the same idempotency key', async () => {
  const deps = dependencies();
  const first = await createPatient(deps, context, createInput, 'key-a');
  const replay = await createPatient(deps, context, createInput, 'key-a');
  assert.equal(first.patientId, 'patient-created');
  assert.equal(replay.patientId, first.patientId);
});

test('rejects a reused idempotency key with a different request', async () => {
  const deps = dependencies();
  await createPatient(deps, context, createInput, 'key-a');
  await assert.rejects(
    createPatient(deps, context, { ...createInput, fullName: 'Different' }, 'key-a'),
    (error: unknown) => error instanceof PatientApplicationError && error.code === 'IDEMPOTENCY_CONFLICT',
  );
});

test('fails closed for missing authentication or tenant context', async () => {
  await assert.rejects(
    listPatients(dependencies(), createUnauthenticatedRequestContext('request', 'correlation'), {}),
    (error: unknown) => error instanceof PatientApplicationError && error.code === 'FORBIDDEN',
  );
});

test('does not read a tenant B patient from tenant A', async () => {
  const deps = dependencies();
  (deps.patients as MemoryPatients).items.set('patient-b', patient({ patientId: 'patient-b', tenantId: 'tenant-b' }));
  await assert.rejects(
    getPatient(deps, context, 'patient-b'),
    (error: unknown) => error instanceof PatientApplicationError && error.code === 'NOT_FOUND',
  );
});

test('requires the current strong ETag for a Patient patch', async () => {
  const deps = dependencies();
  await assert.rejects(
    patchPatient(deps, context, 'patient-a', { fullName: 'Updated' }, '"2"'),
    (error: unknown) => error instanceof PatientApplicationError && error.code === 'PRECONDITION_FAILED',
  );
  const updated = await patchPatient(deps, context, 'patient-a', { fullName: 'Updated' }, '"1"');
  assert.equal(updated.fullName, 'Updated');
  assert.equal(updated.version, 2n);
});

test('rejects unknown search fields and accepts only tenant-scoped list input', async () => {
  await assert.rejects(
    listPatients(dependencies(), context, { unknown: 'value' } as unknown as { readonly fullName?: string }),
    (error: unknown) => error instanceof PatientApplicationError && error.code === 'VALIDATION_ERROR',
  );
  assert.equal((await listPatients(dependencies(), context, { limit: 20 })).every((item) => item.tenantId === 'tenant-a'), true);
});

test('BD-02 create enforces canonical Patient identity policy', async () => {
  const deps = dependencies();

  const created = await createPatient(deps, context, {
    medicalRecordNumber: '  MRN-MANUAL  ',
    fullName: '  Nguyễn Văn A  ',
    dateOfBirth: '2000-02-29',
    sex: 'OTHER',
  }, 'bd02-minimal');

  assert.equal(created.medicalRecordNumber, 'MRN-MANUAL');
  assert.equal(created.fullName, 'Nguyễn Văn A');
  assert.equal(created.dateOfBirth, '2000-02-29');
  assert.equal(created.sex, 'OTHER');
  assert.equal(created.phone, '');
  assert.equal(created.email, '');
  assert.equal(created.address, '');
  assert.equal(created.emergencyContact, '');
  assert.equal(created.status, 'ACTIVE');
});

test('BD-02 create fails closed when automatic MRN allocation is unresolved', async () => {
  await assert.rejects(
    createPatient(dependencies(), context, {
      fullName: 'No MRN',
      dateOfBirth: '2000-01-01',
      sex: 'UNKNOWN',
    }, 'bd02-no-mrn'),
    (error: unknown) =>
      error instanceof PatientApplicationError &&
      error.code === 'MRN_ALLOCATION_UNAVAILABLE',
  );
});

test('BD-02 create rejects client-controlled status', async () => {
  await assert.rejects(
    createPatient(dependencies(), context, {
      medicalRecordNumber: 'MRN-STATUS',
      fullName: 'Status Injection',
      dateOfBirth: '2000-01-01',
      sex: 'UNKNOWN',
      status: 'INACTIVE',
    } as never, 'bd02-status'),
    (error: unknown) =>
      error instanceof PatientApplicationError &&
      error.code === 'VALIDATION_ERROR',
  );
});

test('BD-02 create rejects non-canonical sex values', async () => {
  for (const sex of ['UNSPECIFIED', 'unknown', '', 'DOCTOR']) {
    await assert.rejects(
      createPatient(dependencies(), context, {
        medicalRecordNumber: 'MRN-BAD-SEX',
        fullName: 'Invalid Sex',
        dateOfBirth: '2000-01-01',
        sex,
      }, 'bd02-bad-sex'),
      (error: unknown) =>
        error instanceof PatientApplicationError &&
        error.code === 'VALIDATION_ERROR',
    );
  }
});

test('BD-02 create rejects malformed, impossible and future dates of birth', async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  for (const dateOfBirth of ['2000-2-01', '2000-02-30', 'not-a-date', tomorrow]) {
    await assert.rejects(
      createPatient(dependencies(), context, {
        medicalRecordNumber: 'MRN-BAD-DOB',
        fullName: 'Invalid DOB',
        dateOfBirth,
        sex: 'UNKNOWN',
      }, 'bd02-bad-dob'),
      (error: unknown) =>
        error instanceof PatientApplicationError &&
        error.code === 'VALIDATION_ERROR',
    );
  }
});

test('BD-02 generic patient.update rejects status mutation', async () => {
  await assert.rejects(
    patchPatient(
      dependencies(),
      context,
      'patient-a',
      { status: 'INACTIVE' } as never,
      '"1"',
    ),
    (error: unknown) =>
      error instanceof PatientApplicationError &&
      error.code === 'VALIDATION_ERROR',
  );
});

test('BD-02 Patient patch rejects non-canonical sex values', async () => {
  await assert.rejects(
    patchPatient(
      dependencies(),
      context,
      'patient-a',
      { sex: 'UNSPECIFIED' },
      '"1"',
    ),
    (error: unknown) =>
      error instanceof PatientApplicationError &&
      error.code === 'VALIDATION_ERROR',
  );
});

test('BD-02 generic Patient patch rejects MRN and unresolved lifecycle fields', async () => {
  const deps = dependencies();

  for (const input of [
    { medicalRecordNumber: 'MRN-CHANGED' },
    { deceasedAt: '2026-09-21T00:00:00.000Z' },
    { archivedAt: '2026-09-21T00:00:00.000Z' },
  ]) {
    await assert.rejects(
      patchPatient(
        deps,
        context,
        'patient-a',
        input as never,
        '"1"',
      ),
      (error: unknown) =>
        error instanceof PatientApplicationError &&
        error.code === 'VALIDATION_ERROR',
    );
  }
});

test('BD-02 Patient patch rejects malformed, impossible and future dates of birth', async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  for (const dateOfBirth of ['2000-2-01', '2000-02-30', 'not-a-date', tomorrow]) {
    await assert.rejects(
      patchPatient(
        dependencies(),
        context,
        'patient-a',
        { dateOfBirth },
        '"1"',
      ),
      (error: unknown) =>
        error instanceof PatientApplicationError &&
        error.code === 'VALIDATION_ERROR',
    );
  }
});
