import assert from 'node:assert/strict';
import test from 'node:test';
import { createNodeAuthTransactionSecretProtector } from '../../../libs/identity/application-entrypoint/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { normalizePatientDirectoryQuery, searchPatientDirectory, PATIENT_DIRECTORY_SORT,
  PatientDirectoryCursorError, type PatientDirectoryDependencies } from '../../../libs/patient/application-entrypoint/src/index.ts';
import type { Patient } from '../../../libs/patient/domain/src/index.ts';
import { createPatientDirectoryCursorCodec } from './patient-directory-cursor.ts';
import { createPatientAuthorization } from './patient-authorization.ts';

const key = 'ab'.repeat(32); // Synthetic test key only.
const codec = createPatientDirectoryCursorCodec(key)!;
const binding = { tenantId: 'tenant-a', permissionRevision: '"1"', normalizedQuery: 'An', sort: PATIENT_DIRECTORY_SORT };
const position = { fullName: 'Anna', patientId: '00000000-0000-0000-0000-000000000001' };
const context = createAuthenticatedRequestContext({ requestId: 'r', correlationId: 'c', userId: 'u', subject: 's',
  tenantId: binding.tenantId, membershipId: 'm', permissionRevision: binding.permissionRevision, roles: ['CLINIC_ADMIN'] });
const hasCode = (code: string) => (error: unknown) => error instanceof PatientDirectoryCursorError && error.code === code;

for (const [label, input] of [
  ['missing', {}], ['non-string', { q: 12 }], ['blank', { q: '  ' }], ['one code point', { q: ' 😀 ' }],
  ['over 100 code points', { q: '😀'.repeat(101) }], ['invalid limit', { q: 'An', limit: 101 }],
  ['unknown filter', { q: 'An', fullName: 'Anna' }],
] as const) {
  test(`directory rejects ${label}`, () => assert.throws(() => normalizePatientDirectoryQuery(input), /VALIDATION_ERROR/));
}
test('directory trims only edges and counts Unicode code points', () => {
  assert.deepEqual(normalizePatientDirectoryQuery({ q: ' \t😀界\n' }), { q: '😀界', limit: 20 });
  assert.equal(normalizePatientDirectoryQuery({ q: '😀'.repeat(100) }).q.length, 200);
  assert.equal(normalizePatientDirectoryQuery({ q: '  An  Na  ' }).q, 'An  Na');
});
test('cursor round-trip is encrypted, randomized and context bound', () => {
  const cursor = codec.encode(binding, position);
  assert.deepEqual(codec.decode(cursor, binding), position);
  assert.notEqual(cursor, codec.encode(binding, position));
  assert.ok(!cursor.includes(position.fullName));
});
for (const field of ['tenantId', 'normalizedQuery', 'sort'] as const) {
  test(`cursor rejects wrong ${field}`, () => {
    assert.throws(() => codec.decode(codec.encode(binding, position), { ...binding, [field]: 'other' }), hasCode('INVALID_PAGINATION_CURSOR'));
  });
}
test('permission revision binding is exact and distinctly stale', () => {
  for (const permissionRevision of ['"2"', '1', 'W/"1"', '"01"']) {
    assert.throws(() => codec.decode(codec.encode(binding, position), { ...binding, permissionRevision }), hasCode('CONTEXT_STALE'));
  }
});
test('raw UUID, malformed, tampered and wrong-key cursors are rejected', () => {
  const cursor = codec.encode(binding, position);
  const parts = cursor.split('.');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  ciphertext[0] ^= 1;
  parts[3] = ciphertext.toString('base64url');
  for (const invalid of [position.patientId, 'garbage', parts.join('.'), cursor + '=', 'v2' + cursor.slice(2)]) {
    assert.throws(() => codec.decode(invalid, binding), hasCode('INVALID_PAGINATION_CURSOR'));
  }
  assert.throws(() => createPatientDirectoryCursorCodec('cd'.repeat(32))!.decode(cursor, binding), hasCode('INVALID_PAGINATION_CURSOR'));
});
test('authenticated unsupported payload version is rejected', () => {
  const cursor = createNodeAuthTransactionSecretProtector(key).protect(JSON.stringify({
    ...binding, version: 2, purpose: 'patient-directory', lastFullName: position.fullName, lastPatientId: position.patientId,
  }));
  assert.throws(() => codec.decode(cursor, binding), hasCode('INVALID_PAGINATION_CURSOR'));
});
test('cursor configuration is disabled when missing and rejects invalid keys', () => {
  assert.equal(createPatientDirectoryCursorCodec(undefined), null);
  assert.equal(createPatientDirectoryCursorCodec(''), null);
  for (const invalid of ['secret', 'a'.repeat(63), 'z'.repeat(64)]) assert.throws(() => createPatientDirectoryCursorCodec(invalid), /VIORA_PATIENT_CURSOR_ENCRYPTION_KEY/);
});

function fixture(count: number) {
  const rows: Patient[] = Array.from({ length: count }, (_, index) => ({
    ...position, patientId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    tenantId: binding.tenantId, userId: null, medicalRecordNumber: 'test', dateOfBirth: '1990-01-01',
    sex: 'UNKNOWN', status: 'ACTIVE', phone: '', email: '', address: '', emergencyContact: '', version: 1n,
    createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z',
  }));
  const calls: unknown[] = [];
  const dependencies: PatientDirectoryDependencies = {
    patients: { async searchDirectory(input) { calls.push(input); return rows; } },
    authorization: createPatientAuthorization(new Set(['patient.read'])), patientDirectoryCursor: codec,
  };
  return { rows, calls, dependencies };
}
test('first page overfetches one and cursors the last returned item, then continues by keyset', async () => {
  const { rows, calls, dependencies } = fixture(3);
  const result = await searchPatientDirectory(dependencies, context, { q: ' An ', limit: 2 });
  assert.deepEqual(result.data, rows.slice(0, 2));
  assert.equal(result.page.hasMore, true);
  assert.deepEqual(codec.decode(result.page.nextCursor!, binding), { fullName: rows[1].fullName, patientId: rows[1].patientId });
  await searchPatientDirectory(dependencies, context, { q: 'An', limit: 2, cursor: result.page.nextCursor! });
  assert.deepEqual(calls, [
    { tenantId: binding.tenantId, q: 'An', limit: 3, after: undefined },
    { tenantId: binding.tenantId, q: 'An', limit: 3, after: { fullName: rows[1].fullName, patientId: rows[1].patientId } },
  ]);
});
for (const count of [0, 1, 2]) {
  test(`final page of ${count} items has no next cursor`, async () => {
    const { dependencies } = fixture(count);
    assert.deepEqual((await searchPatientDirectory(dependencies, context, { q: 'An', limit: 2 })).page, { hasMore: false, nextCursor: null });
  });
}
test('missing protection, denied permission, invalid query and foreign cursor fail before database reads', async () => {
  const { dependencies, calls } = fixture(3);
  await assert.rejects(searchPatientDirectory({ ...dependencies, patientDirectoryCursor: null }, context, { q: 'An' }), hasCode('CURSOR_NOT_CONFIGURED'));
  await assert.rejects(searchPatientDirectory({ ...dependencies, authorization: createPatientAuthorization(new Set()) }, context, { q: 'An' }), /FORBIDDEN/);
  await assert.rejects(searchPatientDirectory(dependencies, context, { q: '' }), /VALIDATION_ERROR/);
  await assert.rejects(searchPatientDirectory(dependencies, context, { q: 'An', cursor: codec.encode({ ...binding, tenantId: 'tenant-b' }, position) }), hasCode('INVALID_PAGINATION_CURSOR'));
  await assert.rejects(searchPatientDirectory(dependencies, context, { q: 'An', cursor: codec.encode({ ...binding, permissionRevision: '"2"' }, position) }), hasCode('CONTEXT_STALE'));
  assert.deepEqual(calls, []);
});
