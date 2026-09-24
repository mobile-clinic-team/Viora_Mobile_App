import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { authorizePatientCommand } from './patient-command-authorization.ts';
import { validatePatientCreate, validatePatientPatch, patientExpectedVersion } from './patient-command-validation.ts';
import type { Patient } from '../../../libs/patient/domain/src/index.ts';

const body = { medicalRecordNumber: ' Manual MRN ', fullName: ' Nguyễn ', dateOfBirth: '1900-01-01', sex: 'UNKNOWN', phone: null, email: null, address: null, emergencyContact: null };
test('BD-02 requires identity fields, permits old DOB and single Unicode names, rejects extra mutation fields', () => {
  assert.equal(validatePatientCreate(body).medicalRecordNumber, 'Manual MRN');
  assert.equal(validatePatientCreate({ ...body, fullName: '李' }).fullName, '李');
  for (const patch of [{ fullName: ' ' }, { dateOfBirth: '2026-02-30' }, { dateOfBirth: '9999-01-01' }, { sex: null }, { sex: 'UNSPECIFIED' }, { status: 'ACTIVE' }, { userId: 'u' }, { deceased: true }]) {
    assert.throws(() => validatePatientCreate({ ...body, ...patch }), { code: 'VALIDATION_ERROR' });
  }
  assert.throws(() => validatePatientCreate({ ...body, medicalRecordNumber: null }), { code: 'FEATURE_UNAVAILABLE', status: 503 });
  for (const patch of [{}, { status: 'INACTIVE' }, { medicalRecordNumber: 'other' }, { dateOfBirth: null }, { clinicalNotes: 'secret' }, { archivedAt: null }]) {
    assert.throws(() => validatePatientPatch(patch), { code: 'VALIDATION_ERROR' });
  }
  assert.deepEqual(validatePatientPatch({ phone: null, emergencyContact: null }), { phone: '', emergencyContactDetails: null });
});

test('P04 distinguishes missing, malformed and valid-but-stale opaque validators without numeric rounding', () => {
  assert.throws(() => patientExpectedVersion(undefined), { code: 'PRECONDITION_REQUIRED', status: 428 });
  for (const token of ['*', 'W/"1"', '"1", "2"', ['"1"'], '1']) assert.throws(() => patientExpectedVersion(token), { code: 'INVALID_PRECONDITION', status: 400 });
  for (const token of ['"rec-7"', '"0"', '"9223372036854775808"']) assert.throws(() => patientExpectedVersion(token), { code: 'VERSION_CONFLICT', status: 412 });
  assert.equal(patientExpectedVersion('"9007199254740993"'), 9007199254740993n);
});

test('BD-01 Patient mutations require grants, role ceilings and current Doctor relationship; receptionist purpose is closed', async () => {
  const context = (roles: string[]) => createAuthenticatedRequestContext({ requestId: 'r', correlationId: 'c', userId: 'u', subject: 's', tenantId: 't', membershipId: 'm', permissionRevision: '"1"', roles });
  const patient = { tenantId: 't', patientId: 'p' } as Patient;
  const grants = new Set(['patient.create', 'patient.update']);
  for (const role of ['CLINIC_ADMIN', 'DOCTOR', 'NURSE']) {
    await authorizePatientCommand(context([role]), grants, 'patient.create');
    await assert.rejects(authorizePatientCommand(context([role]), new Set(), 'patient.create'), { code: 'FORBIDDEN' });
  }
  for (const role of ['RECEPTIONIST', 'PATIENT', 'SUPER_ADMIN', 'UNKNOWN']) await assert.rejects(authorizePatientCommand(context([role]), grants, 'patient.create'), { code: 'FORBIDDEN' });
  await assert.rejects(authorizePatientCommand(context(['DOCTOR']), grants, 'patient.update', undefined, patient), { code: 'FORBIDDEN' });
  for (const active of [true, false]) {
    const promise = authorizePatientCommand(context(['DOCTOR']), grants, 'patient.update', { async hasActive() { return active; } }, patient);
    if (active) await promise; else await assert.rejects(promise, { code: 'FORBIDDEN' });
  }
  await assert.rejects(authorizePatientCommand(context(['CLINIC_ADMIN']), grants, 'patient.update', undefined, { ...patient, tenantId: 'other' }), { code: 'FORBIDDEN' });
});
