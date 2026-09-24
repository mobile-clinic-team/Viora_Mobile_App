import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresOperationStore } from './index.ts';
import type { IdempotencyQueryClient } from './postgres-idempotency-store.ts';

const now = new Date('2026-09-21T00:00:00Z');
const input = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  requestFingerprint: 'a'.repeat(64), operationCreatedAt: now,
};
const admitted = { ...input, operationId: '44444444-4444-4444-8444-444444444444' };
const success = {
  resultResourceType: 'patient', resultResourceId: '55555555-5555-4555-8555-555555555555',
  resultResourceVersion: 9007199254740993n, resultHttpStatus: 201 as const,
};
const row = {
  id: admitted.operationId, tenant_id: input.tenantId, actor_id: input.actorId,
  idempotency_key: input.idempotencyKey, request_fingerprint: input.requestFingerprint,
  operation_created_at: now, status: 'PROCESSING', result_resource_type: null,
  result_resource_id: null, result_resource_version: null, result_http_status: null,
  failure_code: null, created_at: now, updated_at: now,
};
function fixture(reply: (values: readonly unknown[]) => readonly Record<string, unknown>[] = () => [row]) {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const session: IdempotencyQueryClient = {
    async query<R extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) {
      calls.push({ sql, values });
      return { rows: reply(values) as readonly R[] };
    },
  };
  return { store: new PostgresOperationStore(session), calls };
}

test('admission generates an operation ID and preserves the concurrent database winner', async () => {
  let winner: unknown;
  const { store, calls } = fixture((values) => {
    winner ??= values[5];
    return [{ ...row, id: winner }];
  });
  const results = await Promise.all(Array.from({ length: 8 }, () => store.admit(input, now)));
  assert.equal(results.filter((r) => r.kind === 'STARTED').length, 1);
  assert.equal(results.filter((r) => r.kind === 'IN_PROGRESS').length, 7);
  assert.equal(new Set(results.map((r) => r.record.operationId)).size, 1);
  assert.match(String(winner), /^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, actor_id, idempotency_key\)/);
  assert.match(calls[0].sql, /DO UPDATE SET id = current.id/);
  assert.deepEqual(calls[0].values.slice(0, 5), Object.values(input));
});

for (const status of ['PROCESSING', 'INDETERMINATE', 'SUCCEEDED', 'FAILED', 'CLOSED']) {
  test(`${status} repeats preserve the original result and reject different intent`, async () => {
    const { store } = fixture(() => [{ ...row, status, failure_code: status === 'FAILED' ? 'CONFLICT' : null, result_http_status: 409 }]);
    const result = await store.admit(input, now);
    assert.equal(result.kind, ['PROCESSING', 'INDETERMINATE'].includes(status) ? 'IN_PROGRESS' : 'REPLAY');
    assert.equal(result.record.resultHttpStatus, 409);
    assert.equal((await store.admit({ ...input, requestFingerprint: 'b'.repeat(64) }, now)).kind, status === 'CLOSED' ? 'REPLAY' : 'CONFLICT');
    assert.equal((await store.admit({ ...input, operationCreatedAt: new Date(now.getTime() - 1) }, now)).kind, 'CONFLICT');
  });
}

test('invalid identity, fingerprint and timestamp fail before database access', async () => {
  const { store, calls } = fixture();
  for (const patch of [
    { tenantId: '' }, { actorId: "'; --" }, { idempotencyKey: 'not-uuid' },
    { idempotencyKey: '33333333-3333-1333-8333-333333333333' },
    { requestFingerprint: 'A'.repeat(64) }, { operationCreatedAt: new Date(NaN) },
    { operationCreatedAt: new Date(now.getTime() + 60_001) },
  ]) await assert.rejects(store.admit({ ...input, ...patch }, now), { message: 'INVALID_OPERATION' });
  await assert.rejects(store.admit({ ...input, operationCreatedAt: new Date(now.getTime() - 86_400_001) }, now), { message: 'OPERATION_EXPIRED' });
  assert.equal(calls.length, 0);
});

test('admission accepts exact timestamp window boundaries', async () => {
  const { store } = fixture((v) => [{ ...row, id: v[5], operation_created_at: v[4] }]);
  for (const offset of [-86_400_000, 60_000]) {
    assert.equal((await store.admit({ ...input, operationCreatedAt: new Date(now.getTime() + offset) }, now)).kind, 'STARTED');
  }
});

test('completion atomically links the primary resource and preserves bigint precision', async () => {
  const { store, calls } = fixture(() => [{ ...row, status: 'SUCCEEDED', result_resource_version: success.resultResourceVersion.toString(), result_http_status: 201 }]);
  const result = await store.complete(admitted, success);
  assert.equal(result.resultResourceVersion, success.resultResourceVersion);
  assert.equal(result.resultHttpStatus, 201);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WITH finished AS/);
  assert.match(calls[0].sql, /INSERT INTO operation_resource_refs/);
  assert.match(calls[0].sql, /FROM finished RETURNING operation_id/);
  assert.equal(calls[0].values[8], success.resultResourceVersion.toString());
});

for (const method of ['complete', 'fail'] as const) {
  test(`${method} fences stale or terminal callers by exact identity, intent and operation ID`, async () => {
    const { store, calls } = fixture(() => []);
    const invoke = () => method === 'complete' ? store.complete(admitted, success)
      : store.fail(admitted, { failureCode: 'CONFLICT', resultHttpStatus: 409 });
    await assert.rejects(invoke(), { message: 'OPERATION_NOT_PROCESSING' });
    assert.deepEqual(calls[0].values.slice(0, 6), [...Object.values(input), admitted.operationId]);
    for (const clause of ['tenant_id = $1', 'actor_id = $2', 'idempotency_key = $3', 'request_fingerprint = $4', 'operation_created_at = $5', 'id = $6', "status = 'PROCESSING'"]) {
      assert.ok(calls[0].sql.includes(clause));
    }
  });
}

test('known failure persists public error and HTTP status', async () => {
  const { store, calls } = fixture(() => [{ ...row, status: 'FAILED', failure_code: 'CONFLICT', result_http_status: 409 }]);
  const result = await store.fail(admitted, { failureCode: 'CONFLICT', resultHttpStatus: 409 });
  assert.equal(result.failureCode, 'CONFLICT');
  assert.equal(result.status, 'FAILED');
  assert.deepEqual(calls[0].values.slice(6), ['CONFLICT', 409]);
});

test('database/ref errors propagate unchanged to the owning transaction', async () => {
  const error = new Error('resource ref write failed');
  const { store } = fixture(() => { throw error; });
  await assert.rejects(store.complete(admitted, success), (actual) => actual === error);
  await assert.rejects(store.fail(admitted, { failureCode: 'CONFLICT', resultHttpStatus: 409 }), (actual) => actual === error);
  await assert.rejects(store.admit(input, now), (actual) => actual === error);
});

test('invalid results cannot settle an operation', async () => {
  const { store, calls } = fixture();
  await assert.rejects(store.complete(admitted, { ...success, resultResourceVersion: 0n }));
  await assert.rejects(store.complete(admitted, { ...success, resultResourceVersion: 9223372036854775808n }));
  await assert.rejects(store.complete(admitted, { ...success, resultResourceId: 'invalid' }));
  await assert.rejects(store.fail(admitted, { failureCode: 'request body', resultHttpStatus: 409 }));
  await assert.rejects(store.fail(admitted, { failureCode: 'CONFLICT', resultHttpStatus: 200 }));
  assert.equal(calls.length, 0);
});
