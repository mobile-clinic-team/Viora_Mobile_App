import assert from 'node:assert/strict';
import test from 'node:test';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { ReadError } from '../../../libs/platform/context/src/read-page.ts';
import { createPatientSelfAppointments, resolveSelfPatients, validateSelfBookingBody } from './patient-self-appointments.ts';

const self: RequestContext = { requestId: 'request', correlationId: 'correlation',
  actor: { kind: 'HUMAN', userId: '00000000-0000-0000-0000-000000000001', subject: 'subject' }, tenant: null };
const one = { tenant_id: '00000000-0000-0000-0000-000000000011', patient_id: '00000000-0000-0000-0000-000000000021', patient_status: 'ACTIVE', tenant_status: 'ACTIVE' };
const two = { ...one, tenant_id: '00000000-0000-0000-0000-000000000012', patient_id: '00000000-0000-0000-0000-000000000022' };
const row = { id: '00000000-0000-0000-0000-000000000031', tenant_id: one.tenant_id, clinic_name: 'Clinic A', doctor_name: 'Doctor A', location_name: 'Room A',
  starts_at: '2026-10-01T08:00:00.000000Z', ends_at: '2026-10-01T08:30:00.000000Z', status: 'PENDING', reason: 'Consultation' };

test('self resolver derives all clinic links from authenticated user and fails closed', async () => {
  const db = { async query(_sql: string, args?: readonly unknown[]) { assert.deepEqual(args, [self.actor!.userId]); return { rows: [one, two] }; } };
  assert.deepEqual(await resolveSelfPatients(db as never, self), [
    { tenantId: one.tenant_id, patientId: one.patient_id }, { tenantId: two.tenant_id, patientId: two.patient_id },
  ]);
  await assert.rejects(resolveSelfPatients({ query: async () => ({ rows: [one, { ...one, patient_id: two.patient_id }] }) } as never, self),
    (error: unknown) => error instanceof ReadError && error.code === 'FORBIDDEN');
  await assert.rejects(resolveSelfPatients({ query: async () => ({ rows: [one, { ...one, patient_id: two.patient_id, patient_status: 'INACTIVE' }] }) } as never, self),
    (error: unknown) => error instanceof ReadError && error.code === 'FORBIDDEN');
  await assert.rejects(resolveSelfPatients({ query: async () => ({ rows: [] }) } as never, self),
    (error: unknown) => error instanceof ReadError && error.code === 'NOT_FOUND');
  await assert.rejects(resolveSelfPatients({ query: async () => { throw new Error('database failed'); } } as never, self), /database failed/);
  await assert.rejects(resolveSelfPatients(db as never, { ...self, actor: null }),
    (error: unknown) => error instanceof ReadError && error.code === 'FORBIDDEN');
});

test('self list rejects identity selectors, pages deterministically, and exposes safe projection', async () => {
  let calls = 0;
  const db = { async query(sql: string, args?: readonly unknown[]) {
    calls++;
    if (sql.includes('FROM patients p JOIN tenants')) return { rows: [one, two] };
    assert.match(sql, /p\.user_id=\$1/);
    assert.deepEqual(args, [self.actor!.userId, null, null, 2]);
    return { rows: [row, { ...row, id: '00000000-0000-0000-0000-000000000032' }] };
  }, async transaction() { throw new Error('not used'); } };
  const cursor = { encode(_binding: unknown, position: readonly string[]) { assert.deepEqual(position, [row.starts_at, row.id]); return 'opaque'; },
    decode() { throw new Error('not used'); } };
  const audit = { async append() { return { kind: 'APPENDED' as const }; } };
  const api = createPatientSelfAppointments(db as never, cursor as never, audit as never);
  const result = await api.list(self, new URL('https://example.test/v1/me/appointments?limit=1'));
  assert.equal(result.page.hasMore, true);
  assert.equal(result.page.nextCursor, 'opaque');
  assert.deepEqual(result.data, [{ id: row.id, clinicName: 'Clinic A', doctorName: 'Doctor A', locationName: 'Room A',
    startsAt: row.starts_at, endsAt: row.ends_at, status: 'PENDING', reason: 'Consultation' }]);
  assert.equal(JSON.stringify(result).includes('patientId'), false);
  assert.equal(JSON.stringify(result).includes('notes'), false);
  for (const selector of ['patientId', 'tenantId', 'userId']) {
    await assert.rejects(api.list(self, new URL(`https://example.test/v1/me/appointments?${selector}=${two.patient_id}`)),
      (error: unknown) => error instanceof ReadError && error.code === 'VALIDATION_ERROR');
  }
  assert.equal(calls, 2);
  const failedAudit = createPatientSelfAppointments(db as never, cursor as never,
    { async append() { throw new Error('audit failed'); } } as never);
  await assert.rejects(failedAudit.list(self, new URL('https://example.test/v1/me/appointments?limit=1')), /audit failed/);
});

test('booking schema rejects authority and accepts only patient-editable intent', () => {
  const body = { doctorId: one.patient_id, locationId: two.patient_id, startsAt: '2026-10-01T08:00:00Z', reason: 'Consultation' };
  assert.doesNotThrow(() => validateSelfBookingBody(body));
  for (const field of ['patientId', 'userId', 'tenantId', 'membershipId', 'role', 'persona', 'status', 'endsAt']) {
    assert.throws(() => validateSelfBookingBody({ ...body, [field]: 'attacker' }),
      (error: unknown) => error instanceof ReadError && error.code === 'VALIDATION_ERROR');
  }
});
