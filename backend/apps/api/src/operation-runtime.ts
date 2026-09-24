import { randomUUID } from 'node:crypto';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { ReadError } from '../../../libs/platform/context/src/read-page.ts';
import { PostgresOperationStore, OperationStoreError, type OperationRecord, type OperationState } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/postgres-patient-repository.ts';
import type { CareAccessReader } from '../../../libs/patient/domain/src/care-access.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { buildAuditEventInput, buildAuditEvent } from '../../../libs/platform/audit/src/index.ts';
import { createPatientAuthorization } from './patient-authorization.ts';
import { createReadCursorCodec } from './read-cursor.ts';
import { parseOperationIdentity, PatientCommandError, patientWriteReceipt } from './patient-create-operation-contract.ts';
import type { createAiDraftReviewRuntime } from './ai-draft-review.ts';
import type { AuthenticatedSessionIdentity } from './auth-composition.ts';

const day = 86_400_000;
const states: readonly string[] = ['PROCESSING', 'INDETERMINATE', 'SUCCEEDED', 'FAILED', 'CLOSED'];
export function operationStatus(operation: OperationRecord, now = new Date()) {
  const pending = operation.status === 'PROCESSING' || operation.status === 'INDETERMINATE';
  if (!pending && now.getTime() >= operation.updatedAt.getTime() + day) throw new PatientCommandError('OPERATION_EXPIRED', 410);
  return { operationId: operation.idempotencyKey, state: operation.status,
    result: operation.status === 'SUCCEEDED' ? patientWriteReceipt(operation) : null,
    errorCode: operation.status === 'FAILED' ? operation.failureCode : operation.status === 'CLOSED' ? 'OPERATION_CLOSED' : null,
    createdAt: operation.createdAt.toISOString(), expiresAt: pending ? null : new Date(operation.updatedAt.getTime() + day).toISOString() };
}

export interface OperationRequest {
  context: RequestContext; permissions: ReadonlySet<string>; sessionId: string;
  url: URL; method: string; timestamp?: unknown; body?: unknown;
  identity?: AuthenticatedSessionIdentity;
}

export function createOperationRuntime(database: TransactionalDatabase, careAccess: CareAccessReader, cursorKey: string | undefined,
  drafts?:ReturnType<typeof createAiDraftReviewRuntime>) {
  const operations = new PostgresOperationStore(database);
  const patients = new PostgresPatientRepository(database);
  const cursor = createReadCursorCodec(cursorKey);
  return async (request: OperationRequest) => {
    const { context, permissions, sessionId, url, method } = request;
    if (!context.actor || context.actor.kind !== 'HUMAN' || !context.tenant?.membershipId || !context.tenant.permissionRevision) throw new PatientCommandError('FORBIDDEN', 403);
    const scope = { tenantId: context.tenant.tenantId, actorId: context.actor.userId };
    const now = new Date();
    const authorize = async (operation: OperationRecord) => {
      if (operation.tenantId !== scope.tenantId || operation.actorId !== scope.actorId) throw new PatientCommandError('OPERATION_NOT_FOUND', 404);
      if (operation.status === 'SUCCEEDED') {
        if(operation.resultResourceType==='AI_DRAFT'&&drafts&&request.identity) {
          await drafts.bind({context,permissions,identity:request.identity}).recover(operation);return;
        }
        if (operation.resultResourceType !== 'PATIENT' || !operation.resultResourceId) throw new PatientCommandError('FEATURE_UNAVAILABLE', 503);
        const patient = await patients.findById({ tenantId: scope.tenantId, patientId: operation.resultResourceId });
        if (!patient) throw new PatientCommandError('RESOURCE_NOT_FOUND', 404);
        if (!await createPatientAuthorization(permissions, careAccess).allows({ action: 'patient.read', context, patient })) throw new PatientCommandError('FORBIDDEN', 403);
      }
    };
    const status=async(operation:OperationRecord)=>{
      if(operation.status==='SUCCEEDED'&&operation.resultResourceType==='AI_DRAFT'&&drafts&&request.identity) {
        if(now.getTime()>=operation.updatedAt.getTime()+day) throw new PatientCommandError('OPERATION_EXPIRED',410);
        return {operationId:operation.idempotencyKey,state:operation.status,
          result:await drafts.bind({context,permissions,identity:request.identity}).recover(operation),errorCode:null,
          createdAt:operation.operationCreatedAt.toISOString(),expiresAt:new Date(operation.updatedAt.getTime()+day).toISOString()};
      }
      return operationStatus(operation,now);
    };
    const audit = async (db: TransactionalDatabase | Parameters<Parameters<TransactionalDatabase['transaction']>[0]>[0], operation: OperationRecord, action: string) => {
      const result = await new PostgresAuditEventRepository(db).append(buildAuditEvent(buildAuditEventInput(context, {
        id: randomUUID(), sessionId, action, resourceType: 'OPERATION', resourceId: operation.operationId,
        operationId: operation.operationId, result: 'SUCCESS', metadata: {},
      })));
      if (result.kind !== 'APPENDED') throw new PatientCommandError('AUDIT_UNAVAILABLE', 503);
    };
    try {
      if (url.pathname === '/v1/operations') {
        const query: Record<string, string> = {};
        for (const [key, value] of url.searchParams) {
          if (!['limit', 'cursor', 'state'].includes(key) || Object.hasOwn(query, key)) throw new PatientCommandError('INVALID_QUERY', 400);
          query[key] = value;
        }
        if (query.state !== undefined && !states.includes(query.state)) throw new PatientCommandError('INVALID_QUERY', 400);
        const limit = query.limit === undefined ? 20 : Number(query.limit);
        if ((query.limit !== undefined && !/^[1-9][0-9]*$/.test(query.limit)) || limit > 100) throw new PatientCommandError('INVALID_QUERY', 400);
        if (!cursor) throw new PatientCommandError('SERVICE_UNAVAILABLE', 503);
        const binding = { tenantId: scope.tenantId, permissionRevision: context.tenant.permissionRevision,
          purpose: 'operations:' + scope.actorId, query: query.state ?? '', sort: 'createdAt:desc,key:asc' };
        const after = query.cursor === undefined ? undefined : cursor.decode(query.cursor, binding);
        if (after && (after.length !== 2 || !Number.isFinite(Date.parse(after[0])) || !/^[0-9a-f-]{36}$/.test(after[1]))) throw new PatientCommandError('INVALID_CURSOR', 400);
        const rows = await operations.list({ ...scope, state: query.state as OperationState | undefined, limit: limit + 1, after }, now);
        const visible = rows.slice(0, limit);
        // All-or-deny prevents pagination from revealing revoked result references.
        for (const operation of visible) await authorize(operation);
        const data = await Promise.all(visible.map(operation => status(operation)));
        for (const operation of visible) await audit(database, operation, 'operation.replayed');
        const last = visible.at(-1);
        const hasMore = rows.length > limit;
        return { data, page: { hasMore, nextCursor: hasMore && last ? cursor.encode(binding, [last.createdAt.toISOString(), last.idempotencyKey]) : null } };
      }
      if (url.search) throw new PatientCommandError('INVALID_QUERY', 400);
      const id = url.pathname.split('/')[3];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new PatientCommandError('INVALID_REQUEST', 400);
      if (method === 'GET') {
        const operation = await operations.find({ ...scope, idempotencyKey: id });
        if (!operation) throw new PatientCommandError('OPERATION_NOT_FOUND', 404);
        await authorize(operation);
        const data = await status(operation);
        await audit(database, operation, 'operation.replayed');
        return { data };
      }
      if (request.body === null || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length) throw new PatientCommandError('INVALID_REQUEST', 400);
      const identity = parseOperationIdentity(id, request.timestamp);
      return await database.transaction(async transaction => {
        const operation = await new PostgresOperationStore(transaction).close({ ...scope, ...identity }, now);
        if (operation.operationCreatedAt.getTime() !== identity.operationCreatedAt.getTime()) throw new PatientCommandError('IDEMPOTENCY_CONFLICT', 409);
        await authorize(operation);
        const data = await status(operation);
        await audit(transaction, operation, operation.status === 'CLOSED' ? 'operation.closed' : 'operation.replayed');
        return { data };
      });
    } catch (error) {
      if (error instanceof OperationStoreError) throw new PatientCommandError(error.code === 'OPERATION_EXPIRED' ? error.code : 'INVALID_REQUEST', error.code === 'OPERATION_EXPIRED' ? 410 : 400);
      if (error instanceof ReadError) throw new PatientCommandError(error.code === 'CONTEXT_STALE' ? error.code : 'INVALID_CURSOR', error.code === 'CONTEXT_STALE' ? 409 : 400);
      throw error;
    }
  };
}
