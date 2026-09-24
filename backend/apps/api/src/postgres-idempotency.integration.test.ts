import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresIdempotencyStore } from '../../../libs/platform/idempotency/src/index.ts';

const connectionString = process.env.DATABASE_URL;

// Uses the existing DATABASE_URL / VIORA_DISPOSABLE_DATABASE convention.
// Run against a migrated disposable test database; only our UUID fixtures are
// removed. No schema resets or migrations are performed by this focused test.
test('PostgreSQL idempotency concurrency, expiration, replay and scoped finalization', { skip: !connectionString }, async () => {
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error('PostgreSQL integration tests require VIORA_DISPOSABLE_DATABASE=1');
  }
  const database = createPostgresDatabase(connectionString!);
  const store = new PostgresIdempotencyStore(database);
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const identity = { tenantId, actorId, endpoint: 'POST /v1/idempotency-test', key: "integration'; --" };
  const now = new Date('2026-09-20T00:00:00Z');
  const requestHash = 'a'.repeat(64);
  const input = { ...identity, now, requestHash, ttlSeconds: 60 };
  try {
    await database.query(`INSERT INTO tenants (id, name, status, created_at, updated_at)
      VALUES ($1, 'Idempotency fixture', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantId]);
    await database.query(`INSERT INTO users (id, email, status, created_at, updated_at)
      VALUES ($1, $2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [actorId, `${actorId}@example.test`]);
    assert.deepEqual(await store.lookup(input), { kind: 'NEW' });
    const results = await Promise.all(Array.from({ length: 12 }, () => store.begin(input)));
    assert.equal(results.filter(({ kind }) => kind === 'STARTED').length, 1);
    assert.equal(results.filter(({ kind }) => kind === 'CONFLICT').length, 11);
    assert.equal((await store.lookup(input)).kind, 'IN_PROGRESS');
    assert.equal((await store.lookup({ ...input, requestHash: 'b'.repeat(64) })).kind, 'CONFLICT');
    assert.equal((await store.begin({ ...input, requestHash: 'b'.repeat(64) })).kind, 'CONFLICT');

    for (const field of ['tenantId', 'actorId', 'endpoint', 'key'] as const) {
      const other = { ...identity, [field]: randomUUID() };
      await assert.rejects(store.complete({ ...other, responseCode: 201, responseReference: 'ref', completedAt: now }), /IDEMPOTENCY_CONFLICT/);
      await assert.rejects(store.fail({ ...other, failedAt: now }), /IDEMPOTENCY_CONFLICT/);
      assert.equal((await store.lookup(input)).kind, 'IN_PROGRESS');
    }
    const completed = await store.complete({ ...identity, responseCode: 201, responseReference: 'ref', completedAt: now });
    assert.deepEqual(completed, {
      ...identity, requestHash, status: 'SUCCEEDED', responseCode: 201, responseReference: 'ref',
      createdAt: now, expiresAt: new Date(now.getTime() + 60_000),
    });
    assert.equal((await store.lookup(input)).kind, 'REPLAY');
    assert.equal((await store.begin(input)).kind, 'REPLAY');
    await assert.rejects(store.fail({ ...identity, failedAt: now }), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(store.complete({ ...identity, responseCode: 200, responseReference: null, completedAt: now }), /IDEMPOTENCY_CONFLICT/);

    const expired = { ...input, now: completed.expiresAt, requestHash: 'b'.repeat(64) };
    assert.deepEqual(await store.lookup(expired), { kind: 'NEW' });
    const reused = await Promise.all(Array.from({ length: 12 }, () => store.begin(expired)));
    assert.equal(reused.filter(({ kind }) => kind === 'STARTED').length, 1);
    assert.equal(reused.filter(({ kind }) => kind === 'CONFLICT').length, 11);
    const winner = reused.find(({ kind }) => kind === 'STARTED')!;
    assert.equal(winner.record.responseCode, null);
    assert.equal(winner.record.responseReference, null);
    assert.deepEqual(winner.record.createdAt, expired.now);
    const failed = await store.fail({ ...identity, failedAt: expired.now });
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.responseCode, null);
    assert.equal(failed.responseReference, null);
    assert.equal((await store.lookup(expired)).kind, 'REPLAY');
    assert.equal((await store.begin(expired)).kind, 'REPLAY');

    const third = { ...input, now: failed.expiresAt };
    assert.equal((await store.begin(third)).kind, 'STARTED');
    const atExpiry = new Date(third.now.getTime() + 60_000);
    await assert.rejects(store.complete({ ...identity, responseCode: 200, responseReference: null, completedAt: atExpiry }), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(store.fail({ ...identity, failedAt: atExpiry }), /IDEMPOTENCY_CONFLICT/);
    const finalFailure = await store.fail({ ...identity, responseCode: 409, responseReference: 'failure-ref', failedAt: third.now });
    assert.equal(finalFailure.responseCode, 409);
    assert.equal(finalFailure.responseReference, 'failure-ref');
    const fourth = { ...input, now: finalFailure.expiresAt };
    assert.equal((await store.begin(fourth)).kind, 'STARTED');
    const afterProcessingExpiry = { ...fourth, now: new Date(fourth.now.getTime() + 60_000) };
    const reclaimed = await Promise.all(Array.from({ length: 12 }, () => store.begin(afterProcessingExpiry)));
    assert.equal(reclaimed.filter(({ kind }) => kind === 'STARTED').length, 1);
    assert.equal(reclaimed.filter(({ kind }) => kind === 'CONFLICT').length, 11);
  } finally {
    try {
      await database.query('DELETE FROM idempotency_keys WHERE tenant_id = $1 AND actor_id = $2', [tenantId, actorId]);
      await database.query('DELETE FROM users WHERE id = $1', [actorId]);
      await database.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    } finally {
      await database.close();
    }
  }
});
