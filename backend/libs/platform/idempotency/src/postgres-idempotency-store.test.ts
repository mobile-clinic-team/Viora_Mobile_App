import assert from 'node:assert/strict';
import test from 'node:test';
import { IdempotencyError, PostgresIdempotencyStore, type IdempotencyQueryClient } from './index.ts';

const identity = { tenantId: 'tenant-a', actorId: 'actor-a', endpoint: 'POST /v1/test', key: "key'; --" };
const now = new Date('2026-09-20T00:00:00Z');
const hash = 'a'.repeat(64);
const row = {
  id: 'existing-id', tenant_id: identity.tenantId, actor_id: identity.actorId,
  endpoint: identity.endpoint, key: identity.key, request_hash: hash,
  status: 'PROCESSING', response_code: null, response_reference: null,
  created_at: now.toISOString(), expires_at: new Date(now.getTime() + 86_400_000),
};

function fixture(rows: readonly Record<string, unknown>[] | ((values: readonly unknown[]) => readonly Record<string, unknown>[])) {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const database: IdempotencyQueryClient = {
    async query<Row extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) {
      calls.push({ sql, values });
      return { rows: (typeof rows === 'function' ? rows(values) : rows) as readonly Row[] };
    },
  };
  return { store: new PostgresIdempotencyStore(database), calls };
}

test('lookup unknown or expired identity returns NEW with an exclusive expiration bound', async () => {
  const { store, calls } = fixture([]);
  assert.deepEqual(await store.lookup({ ...identity, requestHash: hash, now }), { kind: 'NEW' });
  assert.match(calls[0].sql, /expires_at > \$5/);
  assert.deepEqual(calls[0].values, [...Object.values(identity), now]);
});

for (const [status, requestHash, kind] of [
  ['PROCESSING', 'b'.repeat(64), 'CONFLICT'],
  ['SUCCEEDED', 'b'.repeat(64), 'CONFLICT'],
  ['PROCESSING', hash, 'IN_PROGRESS'],
  ['SUCCEEDED', hash, 'REPLAY'],
  ['FAILED', hash, 'REPLAY'],
] as const) {
  test(`lookup ${status} with ${requestHash === hash ? 'same' : 'different'} hash returns ${kind}`, async () => {
    const { store } = fixture([{ ...row, status }]);
    const result = await store.lookup({ ...identity, requestHash, now });
    assert.equal(result.kind, kind);
    assert.deepEqual(result.record, {
      ...identity, requestHash: hash, status, responseCode: null, responseReference: null,
      createdAt: now, expiresAt: row.expires_at,
    });
  });
}

test('begin atomically inserts PROCESSING with a backend UUID and default TTL', async () => {
  const { store, calls } = fixture((values) => [{ ...row, id: values[4] }]);
  const result = await store.begin({ ...identity, requestHash: hash, now });
  assert.equal(result.kind, 'STARTED');
  assert.equal(result.record.status, 'PROCESSING');
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].values[4]), /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls[0].values.slice(5), [hash, now, row.expires_at]);
  assert.match(calls[0].sql, /ON CONFLICT \(tenant_id, actor_id, endpoint, key\) DO UPDATE/);
});

test('begin replaces expired identity and resets all attempt fields in the same upsert', async () => {
  const { store, calls } = fixture((values) => [{ ...row, id: values[4], expires_at: values[7] }]);
  assert.equal((await store.begin({ ...identity, requestHash: hash, now, ttlSeconds: 30 })).kind, 'STARTED');
  assert.deepEqual(calls[0].values[7], new Date(now.getTime() + 30_000));
  for (const field of ['id', 'request_hash', 'status', 'response_code', 'response_reference', 'created_at', 'expires_at']) {
    assert.ok(calls[0].sql.includes(`${field} = CASE WHEN current.expires_at <= $7`));
  }
});

for (const [status, requestHash, kind] of [
  ['PROCESSING', hash, 'CONFLICT'],
  ['SUCCEEDED', 'b'.repeat(64), 'CONFLICT'],
  ['SUCCEEDED', hash, 'REPLAY'],
  ['FAILED', hash, 'REPLAY'],
] as const) {
  test(`begin ${status} with ${requestHash === hash ? 'same' : 'different'} hash returns ${kind}`, async () => {
    const { store } = fixture([{ ...row, status }]);
    assert.equal((await store.begin({ ...identity, requestHash, now })).kind, kind);
  });
}

test('simultaneous begin responses map the database winner and loser without unique errors', async () => {
  let winner: unknown;
  const { store, calls } = fixture((values) => {
    winner ??= values[4];
    return [{ ...row, id: winner }];
  });
  const results = await Promise.all(Array.from({ length: 8 }, () => store.begin({ ...identity, requestHash: hash, now })));
  assert.equal(results.filter(({ kind }) => kind === 'STARTED').length, 1);
  assert.equal(results.filter(({ kind }) => kind === 'CONFLICT').length, 7);
  assert.equal(calls.length, 8);
});

for (const method of ['complete', 'fail'] as const) {
  test(`${method} parameterizes all four identity fields and returns the canonical terminal record`, async () => {
    const status = method === 'complete' ? 'SUCCEEDED' : 'FAILED';
    const { store, calls } = fixture([{ ...row, status, response_code: 201, response_reference: 'ref' }]);
    const result = await store[method]({ ...identity, responseCode: 201, responseReference: 'ref', completedAt: now, failedAt: now });
    assert.equal(result.status, status);
    assert.equal(result.responseCode, 201);
    assert.equal(result.responseReference, 'ref');
    assert.ok(result.createdAt instanceof Date);
    assert.equal(Object.hasOwn(result, 'tenant_id'), false);
    assert.deepEqual(calls[0].values, [...Object.values(identity), status, 201, 'ref', now]);
    assert.match(calls[0].sql, /tenant_id = \$1 AND actor_id = \$2 AND endpoint = \$3 AND key = \$4/);
    assert.match(calls[0].sql, /status = 'PROCESSING' AND created_at <= \$8 AND expires_at > \$8/);
  });

  test(`${method} rejects missing, expired, terminal or differently scoped targets`, async () => {
    const { store } = fixture([]);
    for (const field of ['tenantId', 'actorId', 'endpoint', 'key'] as const) {
      await assert.rejects(store[method]({ ...identity, [field]: 'other', responseCode: 200, responseReference: null }),
        (error: unknown) => error instanceof IdempotencyError && error.code === 'IDEMPOTENCY_CONFLICT');
    }
  });
}

test('fail defaults both response fields to null', async () => {
  const { store, calls } = fixture([{ ...row, status: 'FAILED' }]);
  await store.fail({ ...identity, failedAt: now });
  assert.deepEqual(calls[0].values.slice(4), ['FAILED', null, null, now]);
});

test('all operations bind values rather than interpolating user input', async () => {
  const { store, calls } = fixture([{ ...row }]);
  await store.lookup({ ...identity, requestHash: hash });
  await store.begin({ ...identity, requestHash: hash });
  await store.complete({ ...identity, responseCode: 201, responseReference: identity.key });
  await store.fail(identity);
  for (const call of calls) {
    for (const value of Object.values(identity)) assert.ok(!call.sql.includes(value));
    assert.deepEqual(call.values.slice(0, 4), Object.values(identity));
    assert.ok(call.values.at(-1) instanceof Date);
  }
});

test('invalid key and TTL fail before querying; missing upsert result fails closed', async () => {
  const { store, calls } = fixture([]);
  await assert.rejects(store.begin({ ...identity, key: '', requestHash: hash }), /INVALID_KEY/);
  for (const ttlSeconds of [0, -1, Infinity, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(store.begin({ ...identity, requestHash: hash, ttlSeconds }), /INVALID_TTL/);
  }
  assert.equal(calls.length, 0);
  await assert.rejects(store.begin({ ...identity, requestHash: hash }), /IDEMPOTENCY_CONFLICT/);
});
