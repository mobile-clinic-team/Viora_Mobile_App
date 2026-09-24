import type {
  AuthenticateAccessTokenRequest,
  AuthenticateAccessTokenResult,
  IdentityContextStore,
  IdentitySubjectReference,
} from '../../../libs/identity/application-entrypoint/src/index.ts';
import {
  IdentityContextError,
  resolveIdentityContext,
} from '../../../libs/identity/application-entrypoint/src/index.ts';
import {
  createAuthenticatedRequestContext,
} from '../../../libs/platform/context/src/index.ts';
import type {
  RequestContext,
} from '../../../libs/platform/context/src/index.ts';

const MAX_ACCESS_TOKEN_LENGTH = 4096;

export interface AccessTokenAuthenticator {
  authenticateAccessToken(
    request: AuthenticateAccessTokenRequest,
  ): Promise<AuthenticateAccessTokenResult>;
}

export interface HttpAuthDependencies {
  readonly sessions: AccessTokenAuthenticator;
  readonly identities: IdentityContextStore;
}

export interface BearerIdentityInput {
  readonly authorizationHeader:
    | string
    | readonly string[]
    | undefined;
  readonly now?: Date;
}

export interface AuthenticatedSessionIdentity {
  readonly sessionId: string;
  readonly userId: string;
  readonly subject: IdentitySubjectReference;
  readonly accessExpiresAt: string;
  readonly expiresAt: string;
}

export interface BearerRequestContextInput
  extends BearerIdentityInput {
  readonly requestId: string;
  readonly correlationId: string;
  readonly requestedTenantId?: string;
}

export interface HttpAuthFailure {
  readonly kind: 'ERROR';
  readonly status: 401 | 403 | 409;
  readonly body: {
    readonly code:
      | 'UNAUTHENTICATED'
      | 'INVALID_IDENTITY'
      | 'MEMBERSHIP_REQUIRED'
      | 'TENANT_CONTEXT_REQUIRED';
  };
}

export type BearerIdentityResult =
  | {
      readonly kind: 'AUTHENTICATED';
      readonly identity: AuthenticatedSessionIdentity;
    }
  | HttpAuthFailure;

export type BearerRequestContextResult =
  | {
      readonly kind: 'AUTHENTICATED';
      readonly identity: AuthenticatedSessionIdentity;
      readonly context: RequestContext;
    }
  | HttpAuthFailure;

function failure(
  status: HttpAuthFailure['status'],
  code: HttpAuthFailure['body']['code'],
): HttpAuthFailure {
  return {
    kind: 'ERROR',
    status,
    body: { code },
  };
}

/**
 * Parses only Viora's expected single Bearer credential.
 *
 * Rejects:
 * - missing/array headers;
 * - leading or trailing whitespace;
 * - multiple credentials / commas;
 * - tabs/newlines;
 * - overlong token values.
 *
 * The auth-scheme itself is case-insensitive as required by HTTP auth.
 */
export function parseBearerAuthorizationHeader(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match =
    /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(value);

  if (!match) {
    return null;
  }

  const token = match[1];

  if (
    token.length === 0 ||
    token.length > MAX_ACCESS_TOKEN_LENGTH
  ) {
    return null;
  }

  return token;
}

/**
 * Authenticates the opaque Viora access token and re-validates the
 * currently active Viora user bound to the exact issuer + subject.
 *
 * This intentionally does not select a workspace. It is suitable for
 * endpoints such as "list my memberships".
 */
export async function authenticateBearerIdentity(
  dependencies: HttpAuthDependencies,
  input: BearerIdentityInput,
): Promise<BearerIdentityResult> {
  const accessToken =
    parseBearerAuthorizationHeader(
      input.authorizationHeader,
    );

  if (!accessToken) {
    return failure(401, 'UNAUTHENTICATED');
  }

  const request: AuthenticateAccessTokenRequest =
    input.now === undefined
      ? { accessToken }
      : { accessToken, now: input.now };

  const authenticated =
    await dependencies.sessions.authenticateAccessToken(
      request,
    );

  if (authenticated.kind !== 'AUTHENTICATED') {
    return failure(401, 'UNAUTHENTICATED');
  }

  const user =
    await dependencies.identities.findUserBySubject(
      authenticated.subject,
    );

  if (
    !user ||
    user.id !== authenticated.userId ||
    user.status !== 'ACTIVE'
  ) {
    return failure(401, 'INVALID_IDENTITY');
  }

  return {
    kind: 'AUTHENTICATED',
    identity: {
      sessionId: authenticated.sessionId,
      userId: authenticated.userId,
      subject: authenticated.subject,
      accessExpiresAt:
        authenticated.accessExpiresAt,
      expiresAt: authenticated.expiresAt,
    },
  };
}

/**
 * Authenticates the session, resolves exactly one active membership,
 * and creates the shared RequestContext used by protected application
 * handlers.
 */
export async function authenticateBearerRequestContext(
  dependencies: HttpAuthDependencies,
  input: BearerRequestContextInput,
): Promise<BearerRequestContextResult> {
  const authenticated =
    await authenticateBearerIdentity(
      dependencies,
      {
        authorizationHeader:
          input.authorizationHeader,
        ...(input.now === undefined
          ? {}
          : { now: input.now }),
      },
    );

  if (authenticated.kind !== 'AUTHENTICATED') {
    return authenticated;
  }

  const resolveInput =
    input.requestedTenantId === undefined
      ? {
          subject:
            authenticated.identity.subject,
        }
      : {
          subject:
            authenticated.identity.subject,
          requestedTenantId:
            input.requestedTenantId,
        };

  try {
    const identityContext =
      await resolveIdentityContext(
        dependencies.identities,
        resolveInput,
      );

    if (
      identityContext.kind !== 'authenticated' ||
      identityContext.actor.userId !==
        authenticated.identity.userId
    ) {
      return failure(401, 'INVALID_IDENTITY');
    }

    return {
      kind: 'AUTHENTICATED',
      identity: authenticated.identity,
      context:
        createAuthenticatedRequestContext({
          requestId: input.requestId,
          correlationId:
            input.correlationId,
          userId:
            identityContext.actor.userId,
          subject:
            identityContext.actor.subject.subject,
          tenantId:
            identityContext.tenant.tenantId,
          membershipId:
            identityContext.tenant.membershipId,
          permissionRevision:
            identityContext.membership.permissionRevision,
          roles: [identityContext.membership.role],
        }),
    };
  } catch (error) {
    if (!(error instanceof IdentityContextError)) {
      throw error;
    }

    switch (error.code) {
      case 'UNAUTHENTICATED':
      case 'INVALID_IDENTITY':
        return failure(401, error.code);
      case 'MEMBERSHIP_REQUIRED':
        return failure(403, error.code);
      case 'TENANT_CONTEXT_REQUIRED':
        return failure(409, error.code);
    }
  }
}
