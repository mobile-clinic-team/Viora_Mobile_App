import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationRuntime, operationStatus } from './operation-runtime.ts';
import type { OperationRecord } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';

const id = '11111111-1111-4111-8111-111111111111';
const internal = '22222222-2222-4222-8222-222222222222';
const now = new Date();
const operation: OperationRecord = { tenantId: id, actorId: id, idempotencyKey: id, operationId: internal,
  operationCreatedAt: now, createdAt: now, updatedAt: now, requestFingerprint: 'a'.repeat(64), status: 'PROCESSING',
  resultResourceType: null, resultResourceId: null, resultResourceVersion: null, resultHttpStatus: null, failureCode: null };

test('recovery exposes the client key and metadata only, preserves unknown states without expiry', () => {
  for (const status of ['PROCESSING', 'INDETERMINATE'] as const) {
    const result = operationStatus({ ...operation, status }, new Date(now.getTime() + 3 * 86400000));
    assert.equal(result.operationId, id); assert.equal(result.expiresAt, null); assert.equal(result.result, null); assert.equal(result.errorCode, null);
    assert.equal(JSON.stringify(result).includes(internal), false);
    assert.equal(JSON.stringify(result).includes('requestFingerprint'), false);
  }
  assert.equal(operationStatus({ ...operation, status: 'CLOSED' }).errorCode, 'OPERATION_CLOSED');
  assert.equal(operationStatus({ ...operation, status: 'FAILED', failureCode: 'VALIDATION_ERROR' }).errorCode, 'VALIDATION_ERROR');
  assert.throws(() => operationStatus({ ...operation, status: 'FAILED' }, new Date(now.getTime() + 86400000)), { code: 'OPERATION_EXPIRED' });
});

function fixture(status = 'PROCESSING') {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const row = { id: internal, tenant_id: id, actor_id: id, idempotency_key: id, operation_created_at: now,
    created_at: now, updated_at: now, request_fingerprint: 'a'.repeat(64), status,
    result_resource_type: status === 'SUCCEEDED' ? 'PATIENT' : null, result_resource_id: status === 'SUCCEEDED' ? id : null,
    result_resource_version: status === 'SUCCEEDED' ? '1' : null, result_http_status: status === 'SUCCEEDED' ? 201 : null, failure_code: null };
  const database: TransactionalDatabase = {
    async query<R extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) {
      calls.push({ sql, values });
      const rows = sql.includes('FROM operations') || sql.includes('INSERT INTO operations') ? [row] : [];
      return { rows: rows as unknown as readonly R[] };
    }, async transaction(work) { return work(database); }, async close() {},
  };
  const runtime = createOperationRuntime(database, { async hasActive() { return false; } }, '12'.repeat(32));
  const request = { context: createAuthenticatedRequestContext({ requestId: id, correlationId: id, userId: id, subject: 's', tenantId: id, membershipId: id, permissionRevision: '"1"', roles: ['CLINIC_ADMIN'] }),
    permissions: new Set<string>(), sessionId: id, method: 'GET', url: new URL('https://example.test/v1/operations/' + id) };
  return { runtime, request, calls };
}

test('OP02 and OP03 authorize result references before mandatory audit or disclosure', async () => {
  const { runtime, request, calls } = fixture('SUCCEEDED');
  await assert.rejects(runtime(request), { code: 'RESOURCE_NOT_FOUND' });
  assert.equal(calls.some(call => call.sql.includes('INSERT INTO audit_events')), false);
  assert.deepEqual(calls[0].values, [id, id, id]);
  await assert.rejects(runtime({ ...request, method: 'POST', url: new URL(request.url + '/close'), body: {}, timestamp: new Date(now.getTime() - 1).toISOString() }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('OP01 rejects invalid filters, repeated parameters and tampered cursors before queries', async () => {
  const { runtime, request, calls } = fixture();
  for (const query of ['?state=UNKNOWN', '?limit=0', '?limit=101', '?limit=1&limit=2', '?extra=x']) {
    await assert.rejects(runtime({ ...request, url: new URL('https://example.test/v1/operations' + query) }), { code: 'INVALID_QUERY' });
  }
  await assert.rejects(runtime({ ...request, url: new URL('https://example.test/v1/operations?cursor=bad') }), { code: 'INVALID_CURSOR' });
  assert.equal(calls.length, 0);
});
