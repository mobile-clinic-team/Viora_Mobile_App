import type { RequestContext } from '../../../shared/src/request-context.ts';

export type { RequestContext } from '../../../shared/src/request-context.ts';

export function createUnauthenticatedRequestContext(
  requestId: string,
  correlationId: string,
): RequestContext {
  return {
    requestId,
    correlationId,
    actor: null,
    tenant: null,
  };
}

export function createAuthenticatedRequestContext(input: {
  readonly requestId: string;
  readonly correlationId: string;
  readonly userId: string;
  readonly subject: string;
  readonly actorKind?: 'HUMAN' | 'AI';
  readonly tenantId: string;
  readonly membershipId: string;
  readonly permissionRevision: string;
  readonly roles?: readonly string[];
}): RequestContext {
  return {
    requestId: input.requestId,
    correlationId: input.correlationId,
    actor: {
      userId: input.userId,
      subject: input.subject,
      kind: input.actorKind ?? 'HUMAN',
    },
    tenant: {
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      permissionRevision: input.permissionRevision,
      ...(input.roles === undefined ? {} : { roles: input.roles }),
    },
  };
}
