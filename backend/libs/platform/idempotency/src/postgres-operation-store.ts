import { randomUUID } from 'node:crypto';
import type { IdempotencyQueryClient } from './postgres-idempotency-store.ts';

export type OperationState = 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CLOSED' | 'INDETERMINATE';
export interface OperationIntent {
  tenantId: string;
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  operationCreatedAt: Date;
}
export interface OperationRecord extends OperationIntent {
  operationId: string;
  status: OperationState;
  resultResourceType: string | null;
  resultResourceId: string | null;
  resultResourceVersion: bigint | null;
  resultHttpStatus: number | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface AdmittedOperation extends OperationIntent { operationId: string }
export interface OperationSuccess {
  resultResourceType: string;
  resultResourceId: string;
  resultResourceVersion: bigint;
  resultHttpStatus: 200 | 201;
}
export class OperationStoreError extends Error {
  public readonly code: 'INVALID_OPERATION' | 'OPERATION_EXPIRED' | 'OPERATION_NOT_PROCESSING';
  constructor(code: OperationStoreError['code']) { super(code); this.code = code; }
}
type Row = Record<string, unknown> & {
  id: string; tenant_id: string; actor_id: string; idempotency_key: string;
  request_fingerprint: string; operation_created_at: Date | string; status: OperationState;
  result_resource_type: string | null; result_resource_id: string | null;
  result_resource_version: string | bigint | null; result_http_status: number | null;
  failure_code: string | null; created_at: Date | string; updated_at: Date | string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const day = 86_400_000;
const fence = `tenant_id = $1 AND actor_id = $2 AND idempotency_key = $3
  AND request_fingerprint = $4 AND operation_created_at = $5 AND id = $6
  AND status = 'PROCESSING'`;
function valid(condition: boolean): asserts condition {
  if (!condition) throw new OperationStoreError('INVALID_OPERATION');
}
function values(input: OperationIntent): unknown[] {
  valid(uuid.test(input.tenantId) && uuid.test(input.actorId) && uuid4.test(input.idempotencyKey));
  valid(/^[0-9a-f]{64}$/.test(input.requestFingerprint));
  valid(input.operationCreatedAt instanceof Date && Number.isFinite(input.operationCreatedAt.getTime()));
  return [input.tenantId, input.actorId, input.idempotencyKey, input.requestFingerprint, input.operationCreatedAt];
}
function record(row: Row): OperationRecord {
  return {
    operationId: row.id, tenantId: row.tenant_id, actorId: row.actor_id,
    idempotencyKey: row.idempotency_key, requestFingerprint: row.request_fingerprint,
    operationCreatedAt: new Date(row.operation_created_at), status: row.status,
    resultResourceType: row.result_resource_type, resultResourceId: row.result_resource_id,
    resultResourceVersion: row.result_resource_version === null ? null : BigInt(row.result_resource_version),
    resultHttpStatus: row.result_http_status, failureCode: row.failure_code,
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  };
}

/** Persistence only: callers authorize and compute the canonical intent fingerprint.
 * Admit on a committed session before effects. Construct another instance with the
 * domain/audit transaction session for completion; propagate every error to rollback.
 * Never reclaim pending work or infer FAILED from a timeout/crash. No payload storage.
 */
export class PostgresOperationStore {
  private readonly database: IdempotencyQueryClient;
  constructor(database: IdempotencyQueryClient) { this.database = database; }

  async admit(input: OperationIntent, now = new Date()): Promise<{
    kind: 'STARTED' | 'IN_PROGRESS' | 'REPLAY' | 'CONFLICT'; record: OperationRecord;
  }> {
    const parameters = values(input);
    valid(Number.isFinite(now.getTime()));
    if (input.operationCreatedAt.getTime() < now.getTime() - day) {
      throw new OperationStoreError('OPERATION_EXPIRED');
    }
    valid(input.operationCreatedAt.getTime() <= now.getTime() + 60_000);
    const id = randomUUID();
    // Unique identity locks the concurrent winner. The no-op update returns that
    // winner even if it was invisible to the statement's initial MVCC snapshot.
    const result = await this.database.query<Row>(`
      INSERT INTO operations AS current
        (tenant_id, actor_id, idempotency_key, request_fingerprint, operation_created_at,
         id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', $7, $7)
      ON CONFLICT (tenant_id, actor_id, idempotency_key)
      DO UPDATE SET id = current.id RETURNING current.*`, [...parameters, id, now]);
    const row = result.rows[0];
    if (!row) throw new OperationStoreError('INVALID_OPERATION');
    const existing = record(row);
    const same = existing.requestFingerprint === input.requestFingerprint
      && existing.operationCreatedAt.getTime() === input.operationCreatedAt.getTime();
    const closed = existing.status === 'CLOSED' && existing.operationCreatedAt.getTime() === input.operationCreatedAt.getTime();
    const kind = row.id === id ? 'STARTED' : closed ? 'REPLAY' : !same ? 'CONFLICT'
      : row.status === 'PROCESSING' || row.status === 'INDETERMINATE' ? 'IN_PROGRESS' : 'REPLAY';
    return { kind, record: existing };
  }

  /** Public operation identity is the client key, scoped to actor/workspace.
   * The internal primary key is deliberately not exposed as a recovery handle. */
  async find(scope: { tenantId: string; actorId: string; idempotencyKey: string }): Promise<OperationRecord | null> {
    valid(uuid.test(scope.tenantId) && uuid.test(scope.actorId) && uuid4.test(scope.idempotencyKey));
    const result = await this.database.query<Row>(`SELECT * FROM operations
      WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
    [scope.tenantId, scope.actorId, scope.idempotencyKey]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async list(scope: { tenantId: string; actorId: string; state?: OperationState; limit: number;
    after?: readonly string[] }, now = new Date()): Promise<readonly OperationRecord[]> {
    valid(uuid.test(scope.tenantId) && uuid.test(scope.actorId) && Number.isInteger(scope.limit) && scope.limit > 0 && scope.limit <= 101);
    const result = await this.database.query<Row>(`SELECT * FROM operations
      WHERE tenant_id=$1 AND actor_id=$2 AND ($3::operation_status IS NULL OR status=$3)
        AND (status IN ('PROCESSING','INDETERMINATE') OR updated_at > $4)
        AND ($5::timestamptz IS NULL OR created_at < $5 OR (created_at=$5 AND idempotency_key > $6::uuid))
      ORDER BY created_at DESC, idempotency_key ASC LIMIT $7`,
    [scope.tenantId, scope.actorId, scope.state ?? null, new Date(now.getTime() - day),
      scope.after?.[0] ?? null, scope.after?.[1] ?? null, scope.limit]);
    return result.rows.map(record);
  }

  /** Same unique lock as admit: only an absent operation may become CLOSED.
   * Call inside a transaction with the mandatory operation.closed audit. */
  async close(scope: { tenantId: string; actorId: string; idempotencyKey: string; operationCreatedAt: Date }, now = new Date()): Promise<OperationRecord> {
    const parameters = values({ ...scope, requestFingerprint: '0'.repeat(64) });
    valid(scope.operationCreatedAt.getTime() <= now.getTime() + 60_000);
    if (scope.operationCreatedAt.getTime() < now.getTime() - day) throw new OperationStoreError('OPERATION_EXPIRED');
    const result = await this.database.query<Row>(`INSERT INTO operations AS current
      (tenant_id, actor_id, idempotency_key, request_fingerprint, operation_created_at,
       id, status, failure_code, result_http_status, created_at, updated_at, closed_at)
      VALUES ($1,$2,$3,$4,$5,$6,'CLOSED','OPERATION_CLOSED',409,$7,$7,$7)
      ON CONFLICT (tenant_id,actor_id,idempotency_key) DO UPDATE SET id=current.id RETURNING current.*`,
    [...parameters, randomUUID(), now]);
    const resultRecord = this.finished(result.rows[0]);
    // Caller maps a mismatched timestamp to IDEMPOTENCY_CONFLICT and rolls back.
    return resultRecord;
  }

  async complete(input: AdmittedOperation, success: OperationSuccess): Promise<OperationRecord> {
    const parameters = values(input);
    valid(uuid.test(input.operationId) && uuid.test(success.resultResourceId));
    valid(success.resultResourceType.trim().length > 0);
    valid(typeof success.resultResourceVersion === 'bigint' && success.resultResourceVersion > 0n
      && success.resultResourceVersion <= 9223372036854775807n);
    valid(success.resultHttpStatus === 200 || success.resultHttpStatus === 201);
    // One statement makes result + ref indivisible even outside an explicit
    // transaction. P02 must additionally include domain + mandatory audit writes.
    const result = await this.database.query<Row>(`
      WITH finished AS (
        UPDATE operations SET status = 'SUCCEEDED', result_resource_type = $7,
          result_resource_id = $8, result_resource_version = $9, result_http_status = $10,
          failure_code = NULL, updated_at = clock_timestamp()
        WHERE ${fence} RETURNING *
      ), linked AS (
        INSERT INTO operation_resource_refs
          (id, tenant_id, operation_id, resource_type, resource_id, resource_version, created_at)
        SELECT $11, tenant_id, id, result_resource_type, result_resource_id,
          result_resource_version, updated_at FROM finished RETURNING operation_id
      ) SELECT finished.* FROM finished JOIN linked ON linked.operation_id = finished.id`,
    [...parameters, input.operationId, success.resultResourceType, success.resultResourceId,
      success.resultResourceVersion.toString(), success.resultHttpStatus, randomUUID()]);
    return this.finished(result.rows[0]);
  }

  /** Use only for a known rejection/no domain commit, after any domain rollback.
   * Uncertain effects require reconciliation, never this transition.
   */
  async fail(input: AdmittedOperation, failure: { failureCode: string; resultHttpStatus: number }): Promise<OperationRecord> {
    const parameters = values(input);
    valid(uuid.test(input.operationId) && /^[A-Z][A-Z0-9_]*$/.test(failure.failureCode));
    valid(Number.isInteger(failure.resultHttpStatus) && failure.resultHttpStatus >= 400 && failure.resultHttpStatus <= 599);
    const result = await this.database.query<Row>(`
      UPDATE operations SET status = 'FAILED', failure_code = $7,
        result_http_status = $8, updated_at = clock_timestamp()
      WHERE ${fence} RETURNING *`,
    [...parameters, input.operationId, failure.failureCode, failure.resultHttpStatus]);
    return this.finished(result.rows[0]);
  }

  private finished(row: Row | undefined): OperationRecord {
    if (!row) throw new OperationStoreError('OPERATION_NOT_PROCESSING');
    return record(row);
  }
}
