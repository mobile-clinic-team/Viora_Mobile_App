import { randomUUID } from 'node:crypto';
import {
  assertValidIdempotencyKey,
  buildExpiresAt,
  IdempotencyError,
  type BeginResult,
  type IdempotencyIdentity,
  type IdempotencyLookupResult,
  type IdempotencyRecord,
  type IdempotencyStatus,
  type IdempotencyStore,
} from './index.ts';

// Structurally compatible with DatabaseSession without coupling this platform
// module to the database implementation (the same pattern as grant stores).
export interface IdempotencyQueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}

type Row = {
  id: string;
  tenant_id: string;
  actor_id: string;
  endpoint: string;
  key: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_code: number | null;
  response_reference: string | null;
  created_at: Date | string;
  expires_at: Date | string;
};

const columns = `id, tenant_id, actor_id, endpoint, key, request_hash, status,
  response_code, response_reference, created_at, expires_at`;
const scope = 'tenant_id = $1 AND actor_id = $2 AND endpoint = $3 AND key = $4';

function identityValues(input: IdempotencyIdentity): readonly string[] {
  assertValidIdempotencyKey(input.key);
  return [input.tenantId, input.actorId, input.endpoint, input.key];
}

function record(row: Row): IdempotencyRecord {
  return {
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    endpoint: row.endpoint,
    key: row.key,
    requestHash: row.request_hash,
    status: row.status,
    responseCode: row.response_code,
    responseReference: row.response_reference,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
  };
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  private readonly database: IdempotencyQueryClient;

  public constructor(database: IdempotencyQueryClient) {
    this.database = database;
  }

  public async lookup(input: Parameters<IdempotencyStore['lookup']>[0]): Promise<IdempotencyLookupResult> {
    const result = await this.database.query<Row>(
      `SELECT ${columns} FROM idempotency_keys WHERE ${scope} AND expires_at > $5`,
      [...identityValues(input), input.now ?? new Date()],
    );
    if (!result.rows[0]) return { kind: 'NEW' };
    const existing = record(result.rows[0]);
    if (existing.requestHash !== input.requestHash) return { kind: 'CONFLICT', record: existing };
    return { kind: existing.status === 'PROCESSING' ? 'IN_PROGRESS' : 'REPLAY', record: existing };
  }

  public async begin(input: Parameters<IdempotencyStore['begin']>[0]): Promise<BeginResult> {
    const now = input.now ?? new Date();
    const expiresAt = buildExpiresAt(now, input.ttlSeconds);
    if (!Number.isFinite(expiresAt.getTime())) throw new IdempotencyError('INVALID_TTL');
    const id = randomUUID();
    // The unique identity arbitrates concurrent inserts. ON CONFLICT locks the
    // latest row, including a winner absent from this statement's snapshot.
    // Active records retain every value; expired records are replaced atomically.
    // Returning our UUID identifies ownership without relying on MVCC internals.
    const result = await this.database.query<Row>(
      `INSERT INTO idempotency_keys AS current (${columns})
       VALUES ($5, $1, $2, $3, $4, $6, 'PROCESSING', NULL, NULL, $7, $8)
       ON CONFLICT (tenant_id, actor_id, endpoint, key) DO UPDATE SET
         id = CASE WHEN current.expires_at <= $7 THEN EXCLUDED.id ELSE current.id END,
         request_hash = CASE WHEN current.expires_at <= $7 THEN EXCLUDED.request_hash ELSE current.request_hash END,
         status = CASE WHEN current.expires_at <= $7 THEN EXCLUDED.status ELSE current.status END,
         response_code = CASE WHEN current.expires_at <= $7 THEN NULL ELSE current.response_code END,
         response_reference = CASE WHEN current.expires_at <= $7 THEN NULL ELSE current.response_reference END,
         created_at = CASE WHEN current.expires_at <= $7 THEN EXCLUDED.created_at ELSE current.created_at END,
         expires_at = CASE WHEN current.expires_at <= $7 THEN EXCLUDED.expires_at ELSE current.expires_at END
       RETURNING ${columns}`,
      [...identityValues(input), id, input.requestHash, now, expiresAt],
    );
    const row = result.rows[0];
    if (!row) throw new IdempotencyError('IDEMPOTENCY_CONFLICT');
    const existing = record(row);
    if (row.id === id) return { kind: 'STARTED', record: existing };
    if (existing.requestHash !== input.requestHash || existing.status === 'PROCESSING') {
      return { kind: 'CONFLICT', record: existing };
    }
    return { kind: 'REPLAY', record: existing };
  }

  public complete(input: Parameters<IdempotencyStore['complete']>[0]): Promise<IdempotencyRecord> {
    return this.finish(input, 'SUCCEEDED', input.responseCode, input.responseReference, input.completedAt ?? new Date());
  }

  public fail(input: Parameters<IdempotencyStore['fail']>[0]): Promise<IdempotencyRecord> {
    return this.finish(input, 'FAILED', input.responseCode ?? null, input.responseReference ?? null, input.failedAt ?? new Date());
  }

  private async finish(
    input: IdempotencyIdentity,
    status: 'SUCCEEDED' | 'FAILED',
    responseCode: number | null,
    responseReference: string | null,
    at: Date,
  ): Promise<IdempotencyRecord> {
    // The current contract has no attempt token. Callers must not finish an old
    // attempt after its identity has expired and been claimed by a new attempt.
    const result = await this.database.query<Row>(
      `UPDATE idempotency_keys SET status = $5, response_code = $6, response_reference = $7
       WHERE ${scope} AND status = 'PROCESSING' AND created_at <= $8 AND expires_at > $8
       RETURNING ${columns}`,
      [...identityValues(input), status, responseCode, responseReference, at],
    );
    if (!result.rows[0]) throw new IdempotencyError('IDEMPOTENCY_CONFLICT');
    return record(result.rows[0]);
  }
}
