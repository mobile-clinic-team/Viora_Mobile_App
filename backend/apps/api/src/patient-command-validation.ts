import type { PatientCreate, PatientProfileChanges, PatientSex } from '../../../libs/patient/domain/src/index.ts';
import { PatientCommandError } from './patient-create-operation-contract.ts';

const fields = ['fullName', 'dateOfBirth', 'sex', 'phone', 'email', 'address', 'emergencyContact'];
function invalid(): never { throw new PatientCommandError('VALIDATION_ERROR', 422); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > max) invalid();
  return trimmed;
}
function dateOfBirth(value: unknown, now: Date): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value > now.toISOString().slice(0, 10)) invalid();
  return value;
}
function sex(value: unknown): PatientSex {
  if (typeof value !== 'string' || !['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'].includes(value)) invalid();
  return value as PatientSex;
}
function contact(value: unknown) {
  if (value === null) return null;
  const input = object(value);
  if (Object.keys(input).length !== 3 || Object.keys(input).some(key => !['name', 'phone', 'relationship'].includes(key))) invalid();
  return { name: text(input.name, 200), phone: text(input.phone, 40),
    relationship: input.relationship === null ? null : text(input.relationship, 100) };
}
function changes(body: Record<string, unknown>, now: Date): PatientProfileChanges {
  return {
    ...(Object.hasOwn(body, 'fullName') ? { fullName: text(body.fullName, 200) } : {}),
    ...(Object.hasOwn(body, 'dateOfBirth') ? { dateOfBirth: dateOfBirth(body.dateOfBirth, now) } : {}),
    ...(Object.hasOwn(body, 'sex') ? { sex: sex(body.sex) } : {}),
    ...(Object.hasOwn(body, 'phone') ? { phone: body.phone === null ? '' : text(body.phone, 40) } : {}),
    ...(Object.hasOwn(body, 'email') ? { email: body.email === null ? '' : text(body.email, 254) } : {}),
    ...(Object.hasOwn(body, 'address') ? { address: body.address === null ? '' : text(body.address, 1000) } : {}),
    ...(Object.hasOwn(body, 'emergencyContact') ? { emergencyContactDetails: contact(body.emergencyContact) } : {}),
  };
}

export function validatePatientCreate(value: unknown, now = new Date()): PatientCreate {
  const body = object(value);
  if (Object.keys(body).some(key => ![...fields, 'medicalRecordNumber'].includes(key))) invalid();
  if ([...fields, 'medicalRecordNumber'].some(key => !Object.hasOwn(body, key))) invalid();
  const parsed = changes(body, now);
  if (!parsed.fullName || !parsed.dateOfBirth || !parsed.sex) invalid();
  if (body.medicalRecordNumber === undefined || body.medicalRecordNumber === null) {
    throw new PatientCommandError('FEATURE_UNAVAILABLE', 503);
  }
  return { userId: null, medicalRecordNumber: text(body.medicalRecordNumber, 80),
    fullName: parsed.fullName, dateOfBirth: parsed.dateOfBirth, sex: parsed.sex,
    phone: parsed.phone ?? '', email: parsed.email ?? '', address: parsed.address ?? '',
    emergencyContact: '', emergencyContactDetails: parsed.emergencyContactDetails ?? null, status: 'ACTIVE' };
}

export function validatePatientPatch(value: unknown, now = new Date()): PatientProfileChanges {
  const body = object(value);
  if (!Object.keys(body).length || Object.keys(body).some(key => !fields.includes(key))) invalid();
  return changes(body, now);
}

export function patientExpectedVersion(value: unknown): bigint {
  if (value === undefined) throw new PatientCommandError('PRECONDITION_REQUIRED', 428);
  if (typeof value !== 'string' || !/^"[\x21\x23-\x7e]*"$/.test(value) || value.length > 128) {
    throw new PatientCommandError('INVALID_PRECONDITION', 400);
  }
  if (!/^"[1-9][0-9]*"$/.test(value)) throw new PatientCommandError('VERSION_CONFLICT', 412);
  const result = BigInt(value.slice(1, -1));
  if (result > 9223372036854775807n) throw new PatientCommandError('VERSION_CONFLICT', 412);
  return result;
}
