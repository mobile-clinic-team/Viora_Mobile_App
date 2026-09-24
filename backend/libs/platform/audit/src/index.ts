import type { AuditEvent, AuditEventInput } from '../../../audit/contracts/src/index.ts';
import type { RequestContext } from '../../context/src/index.ts';

export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}

export class AuditValidationError extends Error {
  public constructor(message = 'invalid audit event') {
    super(message);
    this.name = 'AuditValidationError';
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AuditValidationError(`${field} is required`);
  return value.trim();
}

export interface RequestAuditInput {
  readonly id: string;
  readonly sessionId?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceVersion?: bigint | null;
  readonly result: AuditEvent['result'];
  readonly operationId?: string | null;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export function buildAuditEventInput(
  context: RequestContext,
  input: RequestAuditInput,
): AuditEventInput {
  if (!context.actor || !context.tenant) {
    throw new AuditValidationError('authenticated request context is required');
  }

  return {
    ...input,
    tenantId: context.tenant.tenantId,
    actorId: context.actor.userId,
    requestId: context.requestId,
    correlationId: context.correlationId,
  };
}

export function buildAuditEvent(input: AuditEventInput, now = new Date()): AuditEvent {
  if (!Number.isFinite(now.getTime())) throw new AuditValidationError('createdAt is invalid');
  const metadata = input.metadata;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new AuditValidationError('metadata is invalid');
  for (const value of Object.values(metadata)) {
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new AuditValidationError('metadata contains unsupported value');
  }

  const result = input.result;
  if (result !== 'SUCCESS' && result !== 'DENIED' && result !== 'FAILURE') throw new AuditValidationError('result is invalid');

  const sessionId =
    input.sessionId === undefined
      ? undefined
      : input.sessionId === null
        ? null
        : text(input.sessionId, 'sessionId');

  const operationId =
    input.operationId === undefined
      ? undefined
      : input.operationId === null
        ? null
        : text(input.operationId, 'operationId');

  const resourceVersion = input.resourceVersion;
  if (
    resourceVersion !== undefined &&
    resourceVersion !== null &&
    (typeof resourceVersion !== 'bigint' || resourceVersion < 1n)
  ) {
    throw new AuditValidationError('resourceVersion must be positive');
  }

  return {
    id: text(input.id, 'id'),
    tenantId: text(input.tenantId, 'tenantId'),
    actorId: text(input.actorId, 'actorId'),
    ...(sessionId === undefined ? {} : { sessionId }),
    action: text(input.action, 'action'),
    resourceType: text(input.resourceType, 'resourceType'),
    resourceId: text(input.resourceId, 'resourceId'),
    ...(resourceVersion === undefined ? {} : { resourceVersion }),
    result,
    requestId: text(input.requestId, 'requestId'),
    correlationId: text(input.correlationId, 'correlationId'),
    ...(operationId === undefined ? {} : { operationId }),
    metadata: { ...metadata },
    createdAt:
      input.createdAt === undefined
        ? now.toISOString()
        : text(input.createdAt, 'createdAt'),
  };
}

export async function emitAuditEvent(sink: AuditSink, input: AuditEventInput): Promise<AuditEvent> {
  const event = buildAuditEvent(input);
  await sink.append(event);
  return event;
}
