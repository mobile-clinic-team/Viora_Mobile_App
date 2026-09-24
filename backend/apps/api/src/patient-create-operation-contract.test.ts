import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalOperationJson, parseOperationIdentity, patientCreateFingerprint,
  patientWriteReceipt } from './patient-create-operation-contract.ts';
import type { OperationRecord } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';

const timestamp = '2026-09-21T01:02:03.004Z';
const key = '11111111-1111-4111-8111-111111111111';
const date = new Date(timestamp);

test('operation fingerprint sorts nested keys and preserves exact strings and array order', () => {
  const hash = (body: unknown) => patientCreateFingerprint(body, date);
  assert.equal(hash({ b: 2, a: { y: 1, x: ' name ' } }), hash({ a: { x: ' name ', y: 1 }, b: 2 }));
  assert.notEqual(hash({ fullName: 'name' }), hash({ fullName: ' name ' }));
  assert.notEqual(hash(['a', 'b']), hash(['b', 'a']));
  assert.notEqual(hash({ text: 'é' }), hash({ text: 'e\u0301' }));
  assert.notEqual(hash({}), patientCreateFingerprint({}, new Date(date.getTime() + 1)));
  assert.equal(canonicalOperationJson(JSON.parse('{"__proto__":{"x":1},"10":0,"2":1}')),
    '{"10":0,"2":1,"__proto__":{"x":1}}');
});

test('identity requires canonical UTC and UUIDv4, rejecting calendar normalization', () => {
  assert.deepEqual(parseOperationIdentity(key, timestamp), { idempotencyKey: key, operationCreatedAt: date });
  for (const invalid of ['', timestamp.replace('.004', ''), timestamp.replace('Z', '+00:00'),
    '2026-02-30T01:02:03.004Z', '2026-09-21T24:02:03.004Z']) {
    assert.throws(() => parseOperationIdentity(key, invalid), { message: 'INVALID_REQUEST' });
  }
  for (const invalid of [undefined, key.replace('-4111-', '-1111-'), key.replace('-8111-', '-7111-'), [key]]) {
    assert.throws(() => parseOperationIdentity(invalid, timestamp));
  }
  for (const invalid of [undefined, NaN, Infinity, 1n, new Date()]) assert.throws(() => canonicalOperationJson(invalid));
});

test('receipt contains only durable IDs/versions and expires 24h after settlement', () => {
  const record: OperationRecord = {
    tenantId: key, actorId: key, idempotencyKey: key, operationId: key,
    requestFingerprint: 'a'.repeat(64), operationCreatedAt: date,
    status: 'SUCCEEDED', resultResourceType: 'PATIENT', resultResourceId: key,
    resultResourceVersion: 9007199254740993n, resultHttpStatus: 201, failureCode: null,
    createdAt: date, updatedAt: date,
  };
  assert.deepEqual(patientWriteReceipt(record), {
    operationId: key, state: 'SUCCEEDED', primary: { type: 'PATIENT', id: key,
      parentId: null, versionToken: '"9007199254740993"' }, related: [], handoff: null,
    committedAt: timestamp, expiresAt: '2026-09-22T01:02:03.004Z',
  });
  assert.throws(() => patientWriteReceipt({ ...record, status: 'PROCESSING' }));
});
