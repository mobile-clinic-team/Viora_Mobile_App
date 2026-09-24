import type { createDomainReadRuntime } from './domain-read-composition.ts';
import type { createAiDraftReviewRuntime } from './ai-draft-review.ts';
import type { createClinicalHttpRead } from './clinical-http-read.ts';
import { PasswordAuthError, type PasswordAuthService } from '../../../libs/identity/application/src/password-auth.ts';
import type { createPersonaResolver } from './persona.ts';
import { effectiveGrants } from './authorization-policy.ts';
import { handlePatientRead } from './patient-read.ts';
import type { createPatientCommandRuntime } from './patient-command-runtime.ts';
import type { createOperationRuntime } from './operation-runtime.ts';
import { PatientCommandError, parseOperationIdentity } from './patient-create-operation-contract.ts';
import { validateSelfBookingBody, type createPatientSelfAppointments } from './patient-self-appointments.ts';
import type { createPatientSelfBooking } from './patient-self-booking.ts';
import { ReadError } from '../../../libs/platform/context/src/read-page.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import type { AuditSink } from '../../../libs/platform/audit/src/index.ts';
import { matchDomainRoutes } from './domain-route-gates.ts';
import { randomUUID } from 'node:crypto';
import type { PatientRuntimeDependencies } from './patient-composition.ts';
import { createServer } from 'node:http';
import type {
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';

import {
  handleAuthenticatedGetMe,
  handleAuthenticatedListMyMemberships,
} from './identity-api.ts';
import {
  AuthTransactionServiceError,
} from '../../../libs/identity/application/src/auth-transaction-service.ts';
import type {
  AuthTransactionAuthorization,
  CompleteAuthSessionRequest,
} from '../../../libs/identity/application/src/auth-transaction-service.ts';
import type {
  RefreshSessionRequest,
  RefreshSessionResult,
  RevokeAccessSessionRequest,
  RevokeAccessSessionResult,
  SessionTokenBundle,
} from '../../../libs/identity/application/src/session-service.ts';
import {
  authenticateBearerRequestContext,
  authenticateBearerIdentity,
  parseBearerAuthorizationHeader,
} from './auth-composition.ts';
import type {
  AccessTokenAuthenticator,
  BearerRequestContextResult,
  HttpAuthDependencies,
} from './auth-composition.ts';
import {
  loadWorkspacePermissions,
} from './workspace-permissions.ts';
import type {
  WorkspacePermissionStore,
} from './workspace-permissions.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HeaderValue = string | readonly string[] | undefined;

type HttpStatus =
  | 200
  | 201
  | 204
  | 400
  | 401
  | 403
  | 404
  | 405
  | 409
  | 410
  | 412
  | 413
  | 422
  | 428
  | 503
  | 500;

type ErrorHttpStatus = Exclude<HttpStatus, 200 | 201 | 204>;

type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_IDENTITY'
  | 'INVALID_CREDENTIALS'
  | 'AUTH_BUSY'
  | 'INVALID_AUTHORITY'
  | 'INVALID_WORKSPACE_ID'
  | 'INVALID_PERMISSION_REVISION'
  | 'CONTEXT_STALE'
  | 'INVALID_CORRELATION_ID'
  | 'UNAUTHENTICATED'
  | 'INVALID_IDENTITY'
  | 'MEMBERSHIP_REQUIRED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_REFRESH_TOKEN'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'REFRESH_REPLAY_DETECTED'
  | 'INVALID_AUTH_PROVIDER'
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'INVALID_AUTH_TRANSACTION'
  | 'AUTH_TRANSACTION_EXPIRED'
  | 'AUTH_TRANSACTION_REPLAY'
  | 'OIDC_VERIFICATION_FAILED'
  | 'IDENTITY_NOT_PROVISIONED'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Authentication input is invalid.',
  DUPLICATE_IDENTITY: 'Registration could not be completed.',
  INVALID_CREDENTIALS: 'Email or password is invalid.',
  AUTH_BUSY: 'Authentication is temporarily unavailable.',
  INVALID_AUTHORITY: 'Account authority is unavailable.',
  INVALID_WORKSPACE_ID: 'Workspace header is invalid.',
  INVALID_PERMISSION_REVISION: 'Permission revision header is invalid.',
  CONTEXT_STALE: 'Workspace permission context is stale.',
  INVALID_CORRELATION_ID: 'Correlation header is invalid.',
  UNAUTHENTICATED: 'Authentication is required.',
  INVALID_IDENTITY: 'Authenticated identity is unavailable.',
  MEMBERSHIP_REQUIRED: 'An active workspace membership is required.',
  TENANT_CONTEXT_REQUIRED: 'Workspace selection is required.',
  INVALID_JSON: 'Request body is invalid.',
  PAYLOAD_TOO_LARGE: 'Request body is too large.',
  INVALID_REFRESH_TOKEN: 'Refresh token is invalid.',
  SESSION_REVOKED: 'Session is revoked.',
  SESSION_EXPIRED: 'Session is expired.',
  REFRESH_REPLAY_DETECTED: 'Refresh token reuse was detected.',
  INVALID_AUTH_PROVIDER: 'Authentication provider is invalid.',
  AUTH_PROVIDER_UNAVAILABLE: 'Authentication provider is unavailable.',
  INVALID_AUTH_TRANSACTION: 'Authentication transaction is invalid.',
  AUTH_TRANSACTION_EXPIRED: 'Authentication transaction is expired.',
  AUTH_TRANSACTION_REPLAY: 'Authentication transaction was already used.',
  OIDC_VERIFICATION_FAILED: 'OIDC identity verification failed.',
  IDENTITY_NOT_PROVISIONED: 'Authenticated identity is not provisioned.',
  NOT_FOUND: 'Route not found.',
  METHOD_NOT_ALLOWED: 'Method is not allowed for this route.',
  INTERNAL_ERROR: 'Internal server error.',
};

const MAX_JSON_BODY_BYTES = 16 * 1024;

export interface HttpServerSessionDependencies
  extends AccessTokenAuthenticator {
  refreshSession(
    request: RefreshSessionRequest,
  ): Promise<RefreshSessionResult>;

  revokeAccessSession(
    request: RevokeAccessSessionRequest,
  ): Promise<RevokeAccessSessionResult>;
}

export interface HttpAuthTransactionDependencies {
  createTransaction(
    request?: { readonly providerKey?: string },
  ): Promise<AuthTransactionAuthorization>;

  completeSession(
    request: CompleteAuthSessionRequest,
  ): Promise<SessionTokenBundle>;
}

export interface HttpServerDependencies
  extends HttpAuthDependencies, PatientRuntimeDependencies {
  readonly passwords?: Pick<PasswordAuthService, 'register' | 'login'>;
  readonly resolvePersona?: ReturnType<typeof createPersonaResolver>;
  readonly audit?: AuditSink;
  readonly patientCommands?: ReturnType<typeof createPatientCommandRuntime>;
  readonly operations?: ReturnType<typeof createOperationRuntime>;
  readonly drafts?: ReturnType<typeof createAiDraftReviewRuntime>;
  readonly clinicalRead?: ReturnType<typeof createClinicalHttpRead>;
  readonly domainReads?: ReturnType<typeof createDomainReadRuntime>;
  readonly selfAppointments?: ReturnType<typeof createPatientSelfAppointments>;
  readonly selfBooking?: ReturnType<typeof createPatientSelfBooking>;
  readonly sessions: HttpServerSessionDependencies;
  readonly authTransactions: HttpAuthTransactionDependencies;
  readonly membershipGrants: WorkspacePermissionStore;
}

type JsonBodyResult =
  | { readonly kind: 'PARSED'; readonly body: unknown }
  | {
      readonly kind: 'ERROR';
      readonly status: 400 | 413;
      readonly code: 'INVALID_JSON' | 'PAYLOAD_TOO_LARGE';
    };

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isStrongOpaqueEtag(value: string): boolean {
  return (
    value.length <= 128 &&
    /^"[\x21\x23-\x7E]*"$/.test(value)
  );
}

export function validateWorkspacePermissionRevision(
  value: string | readonly string[] | undefined,
  currentPermissionRevision: string,
): 'VALID' | 'INVALID' | 'STALE' {
  if (
    typeof value !== 'string' ||
    !isStrongOpaqueEtag(value)
  ) {
    return 'INVALID';
  }

  return value === currentPermissionRevision
    ? 'VALID'
    : 'STALE';
}

export type WorkspaceRequestContextResult =
  | BearerRequestContextResult
  | {
      readonly kind: 'ERROR';
      readonly status: 400;
      readonly body: {
        readonly code:
          | 'INVALID_WORKSPACE_ID'
          | 'INVALID_PERMISSION_REVISION';
      };
    }
  | {
      readonly kind: 'ERROR';
      readonly status: 409;
      readonly body: {
        readonly code: 'CONTEXT_STALE';
      };
    };

export async function authenticateWorkspaceRequestContext(
  dependencies: HttpAuthDependencies,
  input: {
    readonly authorizationHeader:
      | string
      | readonly string[]
      | undefined;
    readonly workspaceHeader:
      | string
      | readonly string[]
      | undefined;
    readonly permissionRevisionHeader:
      | string
      | readonly string[]
      | undefined;
    readonly requestId: string;
    readonly correlationId: string;
  },
): Promise<WorkspaceRequestContextResult> {
  if (
    typeof input.workspaceHeader !== 'string' ||
    !isUuid(input.workspaceHeader)
  ) {
    return {
      kind: 'ERROR',
      status: 400,
      body: { code: 'INVALID_WORKSPACE_ID' },
    };
  }

  const authenticated =
    await authenticateBearerRequestContext(
      dependencies,
      {
        authorizationHeader:
          input.authorizationHeader,
        requestId: input.requestId,
        correlationId: input.correlationId,
        requestedTenantId:
          input.workspaceHeader,
      },
    );

  if (authenticated.kind !== 'AUTHENTICATED') {
    return authenticated;
  }

  const tenant = authenticated.context.tenant;

  if (tenant === null) {
    return {
      kind: 'ERROR',
      status: 403,
      body: { code: 'MEMBERSHIP_REQUIRED' },
    };
  }

  const permissionRevision =
    validateWorkspacePermissionRevision(
      input.permissionRevisionHeader,
      tenant.permissionRevision,
    );

  if (permissionRevision === 'INVALID') {
    return {
      kind: 'ERROR',
      status: 400,
      body: {
        code: 'INVALID_PERMISSION_REVISION',
      },
    };
  }

  if (permissionRevision === 'STALE') {
    return {
      kind: 'ERROR',
      status: 409,
      body: { code: 'CONTEXT_STALE' },
    };
  }

  return authenticated;
}
export type WorkspaceRequestPermissionsResult =
  | (
      Extract<
        BearerRequestContextResult,
        { readonly kind: 'AUTHENTICATED' }
      > & {
        readonly permissions: ReadonlySet<string>;
      }
    )
  | Exclude<
      WorkspaceRequestContextResult,
      { readonly kind: 'AUTHENTICATED' }
    >;

export async function authenticateWorkspaceRequestWithPermissions(
  dependencies: HttpServerDependencies,
  input: {
    readonly authorizationHeader:
      | string
      | readonly string[]
      | undefined;
    readonly workspaceHeader:
      | string
      | readonly string[]
      | undefined;
    readonly permissionRevisionHeader:
      | string
      | readonly string[]
      | undefined;
    readonly requestId: string;
    readonly correlationId: string;
  },
): Promise<WorkspaceRequestPermissionsResult> {
  const authenticated =
    await authenticateWorkspaceRequestContext(
      dependencies,
      input,
    );

  if (authenticated.kind !== 'AUTHENTICATED') {
    return authenticated;
  }

  const tenant = authenticated.context.tenant;

  if (tenant === null) {
    return {
      kind: 'ERROR',
      status: 403,
      body: { code: 'MEMBERSHIP_REQUIRED' },
    };
  }

  const permissions = await loadWorkspacePermissions(
    dependencies.membershipGrants,
    {
      tenantId: tenant.tenantId,
      membershipId: tenant.membershipId,
    },
  );

  return {
    ...authenticated,
    permissions: effectiveGrants(tenant.roles ?? [], permissions),
  };
}
function readHeader(
  request: IncomingMessage,
  name: string,
): HeaderValue {
  const values: string[] = [];
  const expectedName = name.toLowerCase();

  for (
    let index = 0;
    index < request.rawHeaders.length;
    index += 2
  ) {
    const headerName = request.rawHeaders[index];
    const headerValue = request.rawHeaders[index + 1];

    if (
      headerName?.toLowerCase() === expectedName &&
      headerValue !== undefined
    ) {
      values.push(headerValue);
    }
  }

  if (values.length === 0) {
    return undefined;
  }

  if (values.length === 1) {
    return values[0];
  }

  return values;
}

function readJsonBody(
  request: IncomingMessage,
  allowEmpty = false,
): Promise<JsonBodyResult> {
  const contentLength = readHeader(
    request,
    'Content-Length',
  );

  if (
    typeof contentLength === 'string' &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_JSON_BODY_BYTES
  ) {
    request.resume();

    return Promise.resolve({
      kind: 'ERROR',
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  const contentType = readHeader(
    request,
    'Content-Type',
  );

  if (
    typeof contentType !== 'string' ||
    contentType.split(';', 1)[0]?.trim().toLowerCase() !==
      'application/json'
  ) {
    request.resume();
    return Promise.resolve({
      kind: 'ERROR',
      status: 400,
      code: 'INVALID_JSON',
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let body = '';

    const settle = (result: JsonBodyResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      if (settled) {
        return;
      }

      bytes += Buffer.byteLength(chunk, 'utf8');

      if (bytes > MAX_JSON_BODY_BYTES) {
        request.resume();
        settle({
          kind: 'ERROR',
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }

      body += chunk;
    });
    request.on('end', () => {
      if (settled) {
        return;
      }

      try {
        settle({
          kind: 'PARSED',
          body: body.trim() === '' && allowEmpty
            ? null
            : JSON.parse(body) as unknown,
        });
      } catch {
        settle({
          kind: 'ERROR',
          status: 400,
          code: 'INVALID_JSON',
        });
      }
    });
    request.on('error', () => {
      settle({
        kind: 'ERROR',
        status: 400,
        code: 'INVALID_JSON',
      });
    });
  });
}

function readProviderKey(body: unknown): string | undefined | null {
  if (body === null) {
    return undefined;
  }

  if (
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return null;
  }

  const provider =
    (body as { readonly provider?: unknown }).provider;

  if (Object.keys(body).some(key => key !== 'provider')) return null;

  if (provider === undefined) {
    return undefined;
  }

  return typeof provider === 'string' && provider.trim()
    ? provider
    : null;
}

function readCompleteAuthSession(
  body: unknown,
): CompleteAuthSessionRequest | null {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    return null;
  }

  const candidate = body as {
    readonly transactionId?: unknown;
    readonly code?: unknown;
    readonly state?: unknown;
  };

  if (Object.keys(body).some(key => !['transactionId', 'code', 'state'].includes(key))) return null;

  if (
    typeof candidate.transactionId !== 'string' ||
    typeof candidate.code !== 'string' ||
    typeof candidate.state !== 'string' ||
    !candidate.transactionId.trim() ||
    !candidate.code.trim() ||
    !candidate.state.trim()
    || !isUuid(candidate.transactionId)
    || candidate.code.length > 4096
    || candidate.state.length > 128
  ) {
    return null;
  }

  return {
    transactionId: candidate.transactionId,
    code: candidate.code,
    state: candidate.state,
  };
}

function readRefreshToken(body: unknown): string | null {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    return null;
  }

  const refreshToken =
    (body as { readonly refreshToken?: unknown }).refreshToken;

  if (
    typeof refreshToken !== 'string' ||
    refreshToken.trim() === ''
  ) {
    return null;
  }

  return refreshToken;
}

function requestPath(request: IncomingMessage): string {
  return new URL(
    request.url ?? '/',
    'http://127.0.0.1',
  ).pathname;
}

function resolveCorrelationId(
  request: IncomingMessage,
  requestId: string,
): { readonly ok: true; readonly correlationId: string } | { readonly ok: false } {
  const value = readHeader(request, 'X-Correlation-ID');

  if (value === undefined) {
    return { ok: true, correlationId: requestId };
  }

  if (typeof value !== 'string' || !isUuid(value)) {
    return { ok: false };
  }

  return { ok: true, correlationId: value };
}

function errorCodeFromBody(body: unknown): ErrorCode {
  if (typeof body === 'object' && body !== null) {
    const candidate = (body as { readonly code?: unknown }).code;

    if (
      typeof candidate === 'string' &&
      candidate in ERROR_MESSAGES
    ) {
      return candidate as ErrorCode;
    }
  }

  return 'INTERNAL_ERROR';
}

function writeJson(
  response: ServerResponse,
  status: HttpStatus,
  body: unknown,
  requestId: string,
  correlationId: string,
  extraHeaders: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Request-ID': requestId,
    'X-Correlation-ID': correlationId,
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function writeError(
  response: ServerResponse,
  status: ErrorHttpStatus,
  code: ErrorCode,
  requestId: string,
  correlationId: string,
  extraHeaders?: Record<string, string>,
): void {
  writeJson(
    response,
    status,
    {
      error: {
        code,
        message: ERROR_MESSAGES[code],
        details: null,
        requestId,
        correlationId,
      },
    },
    requestId,
    correlationId,
    extraHeaders,
  );
}

function writeHandlerResponse(
  response: ServerResponse,
  result: { readonly status: 200 | ErrorHttpStatus; readonly body: unknown },
  requestId: string,
  correlationId: string,
): void {
  if (result.status === 200) {
    writeJson(
      response,
      200,
      { data: result.body },
      requestId,
      correlationId,
    );
    return;
  }

  writeError(
    response,
    result.status,
    errorCodeFromBody(result.body),
    requestId,
    correlationId,
  );
}

function writeNoContent(
  response: ServerResponse,
  requestId: string,
  correlationId: string,
): void {
  response.writeHead(204, {
    'Cache-Control': 'no-store',
    'X-Request-ID': requestId,
    'X-Correlation-ID': correlationId,
  });
  response.end();
}

function writeAuthTransactionError(
  response: ServerResponse,
  error: AuthTransactionServiceError,
  requestId: string,
  correlationId: string,
): void {
  switch (error.code) {
    case 'INVALID_AUTH_PROVIDER':
    case 'INVALID_AUTH_TRANSACTION':
      writeError(
        response,
        400,
        error.code,
        requestId,
        correlationId,
      );
      return;
    case 'AUTH_TRANSACTION_EXPIRED':
    case 'AUTH_TRANSACTION_REPLAY':
    case 'OIDC_VERIFICATION_FAILED':
      writeError(
        response,
        401,
        error.code,
        requestId,
        correlationId,
      );
      return;
    case 'IDENTITY_NOT_PROVISIONED':
      writeError(
        response,
        403,
        error.code,
        requestId,
        correlationId,
      );
      return;
    case 'AUTH_PROVIDER_UNAVAILABLE':
      writeError(
        response,
        503,
        error.code,
        requestId,
        correlationId,
      );
      return;
  }
}

async function dispatchRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: HttpServerDependencies,
  requestId: string,
  correlationId: string,
): Promise<void> {
  const path = requestPath(request);
  const method = request.method ?? '';
  if (path === '/v1/auth/register' || path === '/v1/auth/login') {
    if (method !== 'POST') {
      writeError(response, 405, 'METHOD_NOT_ALLOWED', requestId, correlationId, { Allow: 'POST' });
      return;
    }
    const parsed = await readJsonBody(request);
    if (parsed.kind === 'ERROR') {
      writeError(response, parsed.status, parsed.code, requestId, correlationId);
      return;
    }
    if (!dependencies.passwords) {
      writeError(response, 503, 'AUTH_BUSY', requestId, correlationId);
      return;
    }
    try {
      const registration = path === '/v1/auth/register';
      const data = registration ? await dependencies.passwords.register(parsed.body) : await dependencies.passwords.login(parsed.body);
      writeJson(response, registration ? 201 : 200, { data }, requestId, correlationId);
    } catch (error) {
      if (!(error instanceof PasswordAuthError)) throw error;
      const status = { VALIDATION_ERROR: 400, DUPLICATE_IDENTITY: 409, INVALID_CREDENTIALS: 401, AUTH_BUSY: 503 } as const;
      writeError(response, status[error.code], error.code, requestId, correlationId);
    }
    return;
  }
  if (path === '/v1/me/appointments' || path === '/v1/me/appointments/options' || /^\/v1\/me\/appointment-operations\/[^/]+$/.test(path)) {
    if (method !== 'GET' && (method !== 'POST' || path !== '/v1/me/appointments')) {
      request.resume(); writeError(response, 405, 'METHOD_NOT_ALLOWED', requestId, correlationId, { Allow: 'GET, POST' }); return;
    }
    const authenticated = await authenticateBearerIdentity(dependencies, {
      authorizationHeader: readHeader(request, 'Authorization'),
    });
    if (authenticated.kind !== 'AUTHENTICATED') {
      request.resume(); writeError(response, authenticated.status, authenticated.body.code, requestId, correlationId); return;
    }
    const context: RequestContext = { requestId, correlationId,
      actor: { userId: authenticated.identity.userId, subject: authenticated.identity.subject.subject, kind: 'HUMAN' }, tenant: null };
    try {
      if (!dependencies.selfAppointments) throw new ReadError('FEATURE_UNAVAILABLE');
      const url = new URL(request.url!, 'http://localhost');
      if (path !== '/v1/me/appointments') {
        request.resume();
        if (url.search) throw new ReadError('VALIDATION_ERROR');
        if (!dependencies.selfBooking) throw new ReadError('FEATURE_UNAVAILABLE');
        const data = path.endsWith('/options') ? await dependencies.selfBooking.options(context) :
          await dependencies.selfBooking.recover(context, authenticated.identity.sessionId, path.split('/').at(-1)!);
        if ('primary' in data) response.setHeader('ETag', data.primary.versionToken);
        writeJson(response, 200, path.endsWith('/options') ? data : { data }, requestId, correlationId);
      } else if (method === 'GET') {
        request.resume();
        const page = await dependencies.selfAppointments.list(context, url, authenticated.identity.sessionId);
        writeJson(response, 200, page, requestId, correlationId);
      } else {
        if (url.search) throw new ReadError('VALIDATION_ERROR');
        const parsed = await readJsonBody(request);
        if (parsed.kind === 'ERROR') {
          writeError(response, parsed.status, parsed.code, requestId, correlationId); return;
        }
        validateSelfBookingBody(parsed.body);
        parseOperationIdentity(readHeader(request, 'Idempotency-Key'), readHeader(request, 'X-Operation-Created-At'));
        if (!dependencies.selfBooking) throw new ReadError('FEATURE_UNAVAILABLE');
        const data = await dependencies.selfBooking.create(context, authenticated.identity.sessionId, parsed.body,
          readHeader(request, 'Idempotency-Key'), readHeader(request, 'X-Operation-Created-At'));
        response.setHeader('ETag', data.primary.versionToken);
        writeJson(response, 201, { data }, requestId, correlationId);
      }
    } catch (error) {
      const known = error instanceof ReadError || error instanceof PatientCommandError;
      const code = error instanceof ReadError ? error.code : error instanceof PatientCommandError ? error.code : 'INTERNAL_ERROR';
      const status = error instanceof ReadError ? ({ FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_ERROR: 400,
        INVALID_PAGINATION_CURSOR: 400, CONTEXT_STALE: 409, FEATURE_UNAVAILABLE: 503 } as const)[error.code] :
        error instanceof PatientCommandError ? error.status : 500;
      writeJson(response, status as ErrorHttpStatus, { error: { code, message: 'Patient appointment request unavailable.',
        details: { fields: [], decisionIds: [] }, requestId, correlationId } }, requestId, correlationId);
      if (!known) request.resume();
    }
    return;
  }
  if (path === '/v1/operations' || /^\/v1\/operations\/[^/]+(?:\/close)?$/.test(path)) {
    const expected = path.endsWith('/close') ? 'POST' : 'GET';
    if (method !== expected) { writeError(response, 405, 'METHOD_NOT_ALLOWED', requestId, correlationId, { Allow: expected }); return; }
    const authenticated = await authenticateWorkspaceRequestWithPermissions(dependencies, {
      authorizationHeader: readHeader(request, 'Authorization'), workspaceHeader: readHeader(request, 'X-Workspace-ID'),
      permissionRevisionHeader: readHeader(request, 'X-Permission-Revision'), requestId, correlationId,
    });
    if (authenticated.kind !== 'AUTHENTICATED') { writeError(response, authenticated.status, authenticated.body.code, requestId, correlationId); return; }
    try {
      if (!dependencies.operations) throw new PatientCommandError('SERVICE_UNAVAILABLE', 503);
      let body: unknown;
      if (method === 'POST') {
        const parsed = await readJsonBody(request);
        if (parsed.kind === 'ERROR') throw new PatientCommandError(parsed.code === 'INVALID_JSON' ? 'INVALID_REQUEST' : parsed.code, parsed.status);
        body = parsed.body;
      } else if (readHeader(request, 'Content-Length') !== undefined && readHeader(request, 'Content-Length') !== '0' || readHeader(request, 'Transfer-Encoding') !== undefined) {
        throw new PatientCommandError('INVALID_REQUEST', 400);
      }
      const result = await dependencies.operations({ context: authenticated.context, permissions: authenticated.permissions,
        sessionId: authenticated.identity.sessionId, identity:authenticated.identity, method, url: new URL(request.url!, 'http://localhost'), body,
        timestamp: readHeader(request, 'X-Operation-Created-At') });
      writeJson(response, 200, result, requestId, correlationId);
    } catch (error) {
      const known = error instanceof PatientCommandError;
      writeJson(response, known ? error.status as ErrorHttpStatus : 500, { error: {
        code: known ? error.code : 'INTERNAL_ERROR', message: 'Operation recovery unavailable.',
        details: { fields: [], decisionIds: [] }, requestId, correlationId,
      } }, requestId, correlationId);
    }
    request.resume(); return;
  }
  const draftRoute=/^\/v1\/ai\/drafts(?:\/([^/]+)(?:\/(review|reject|approve|assurance))?)?$/.exec(path);
  if(draftRoute || (dependencies.clinicalRead && /^\/v1\/records\/[^/]+$/.test(path) && method==='GET')) {
    const authenticated=await authenticateWorkspaceRequestWithPermissions(dependencies,{
      authorizationHeader:readHeader(request,'Authorization'),workspaceHeader:readHeader(request,'X-Workspace-ID'),
      permissionRevisionHeader:readHeader(request,'X-Permission-Revision'),requestId,correlationId,
    });
    if(authenticated.kind!=='AUTHENTICATED') {writeError(response,authenticated.status,authenticated.body.code,requestId,correlationId);return;}
    try {
      const url=new URL(request.url!,'http://localhost');
      if(!draftRoute) {
        if(url.search) throw new PatientCommandError('INVALID_QUERY',400);
        const data=await dependencies.clinicalRead!(authenticated.context,authenticated.permissions,authenticated.identity.sessionId,path.split('/').at(-1)!);
        response.setHeader('ETag',data.versionToken);writeJson(response,200,{data},requestId,correlationId);return;
      }
      if(!dependencies.drafts) throw new PatientCommandError('FEATURE_UNAVAILABLE',503);
      const bound=dependencies.drafts.bind(authenticated),id=draftRoute[1],action=draftRoute[2];
      const allowed=!id?'GET':action?'POST':'GET, PATCH';
      if(!allowed.split(', ').includes(method)) {writeError(response,405,'METHOD_NOT_ALLOWED',requestId,correlationId,{Allow:allowed});return;}
      if(!id) {
        if([...url.searchParams.keys()].length!==1||!url.searchParams.has('targetRecordId')) throw new PatientCommandError('INVALID_QUERY',400);
        const ids=await bound.list(url.searchParams.get('targetRecordId')!);
        const data=await Promise.all(ids.map(value=>bound.read(value)));
        writeJson(response,200,{data,page:{hasMore:false,nextCursor:null}},requestId,correlationId);return;
      }
      if(url.search) throw new PatientCommandError('INVALID_QUERY',400);
      if(method==='GET') {
        const data=await bound.read(id);response.setHeader('ETag',data.versionToken);
        writeJson(response,200,{data},requestId,correlationId);return;
      }
      const parsed=await readJsonBody(request);
      if(parsed.kind==='ERROR') {writeError(response,parsed.status,parsed.code,requestId,correlationId);return;}
      if(action==='assurance') {
        if(!parsed.body||typeof parsed.body!=='object'||Array.isArray(parsed.body)||Object.keys(parsed.body).length!==1||!('proof' in parsed.body)) throw new PatientCommandError('VALIDATION_ERROR',422);
        const data=await bound.issueAssurance({draftId:id,ifMatch:readHeader(request,'If-Match'),proof:parsed.body.proof});
        writeJson(response,200,{data},requestId,correlationId);return;
      }
      const token=readHeader(request,'X-Assurance-Token');
      if(token!==undefined&&typeof token!=='string') throw new PatientCommandError('VALIDATION_ERROR',422);
      const result=await bound.command({action:`draft.${action??'edit'}` as 'draft.review'|'draft.reject'|'draft.approve'|'draft.edit',
        draftId:id,ifMatch:readHeader(request,'If-Match'),body:parsed.body,key:readHeader(request,'Idempotency-Key'),
        timestamp:readHeader(request,'X-Operation-Created-At'),assuranceToken:token});
      if(result.replayed) response.setHeader('Idempotency-Replayed','true');
      response.setHeader('ETag',result.receipt.primary.versionToken);
      writeJson(response,200,{data:result.receipt},requestId,correlationId);
    } catch(error) {
      const known=error instanceof PatientCommandError;
      const code=known?error.code:error instanceof ReadError?(error.code==='NOT_FOUND'?'RESOURCE_NOT_FOUND':error.code):'INTERNAL_ERROR';
      const status=known?error.status:error instanceof ReadError?(error.code==='NOT_FOUND'?404:error.code==='FORBIDDEN'?403:400):500;
      writeJson(response,status as ErrorHttpStatus,{error:{code,message:'Draft request unavailable.',details:{fields:[],decisionIds:[]},requestId,correlationId}},requestId,correlationId);
    }
    request.resume();return;
  }
  const gatedRoutes = matchDomainRoutes(path);
  if (gatedRoutes.length) {
    const route = gatedRoutes.find(candidate => candidate.method === method);
    if (!route) { writeError(response, 405, 'METHOD_NOT_ALLOWED', requestId, correlationId, { Allow: gatedRoutes.map(candidate => candidate.method).join(', ') }); return; }
    const authenticated = await authenticateWorkspaceRequestWithPermissions(dependencies, {
      authorizationHeader: readHeader(request, 'Authorization'), workspaceHeader: readHeader(request, 'X-Workspace-ID'),
      permissionRevisionHeader: readHeader(request, 'X-Permission-Revision'), requestId, correlationId,
    });
    if (authenticated.kind !== 'AUTHENTICATED') {
      writeError(response, authenticated.status, authenticated.body.code, requestId, correlationId); return;
    }
    if (dependencies.patientCommands && ((method === 'POST' && route.path === '/v1/patients') ||
        (method === 'PATCH' && route.path === '/v1/patients/{id}'))) {
      const envelope = (code: string) => ({ error: { code, message: 'Patient command unavailable.',
        details: { fields: [], decisionIds: [] }, requestId, correlationId } });
      if (new URL(request.url!, 'http://localhost').search) {
        request.resume(); writeJson(response, 400, envelope('INVALID_QUERY'), requestId, correlationId); return;
      }
      const parsed = await readJsonBody(request);
      if (parsed.kind === 'ERROR') {
        writeJson(response, parsed.status, envelope(parsed.code === 'INVALID_JSON' ? 'INVALID_REQUEST' : parsed.code), requestId, correlationId); return;
      }
      try {
        const result = await dependencies.patientCommands({ context: authenticated.context,
          sessionId: authenticated.identity.sessionId, permissions: authenticated.permissions,
          body: parsed.body, key: readHeader(request, 'Idempotency-Key'), timestamp: readHeader(request, 'X-Operation-Created-At'),
          ...(method === 'PATCH' ? { patientId: path.split('/').at(-1)!, ifMatch: readHeader(request, 'If-Match') } : {}),
        });
        if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
        response.setHeader('ETag', result.receipt.primary.versionToken);
        writeJson(response, result.status, { data: result.receipt }, requestId, correlationId);
      } catch (error) {
        const known = error instanceof PatientCommandError;
        if (known && error.replayed) response.setHeader('Idempotency-Replayed', 'true');
        writeJson(response, known ? error.status as ErrorHttpStatus : 500,
          envelope(known ? error.code : 'INTERNAL_ERROR'), requestId, correlationId);
      }
      return;
    }
    request.resume();
    if (method === 'GET' && (route.path === '/v1/patients' || route.path === '/v1/patients/{id}')) {
      const result = await handlePatientRead(dependencies, authenticated.context, authenticated.permissions, new URL(request.url!, 'http://localhost'));
      if (result.etag) response.setHeader('ETag', result.etag);
      writeJson(response, result.status, result.body, requestId, correlationId);
      return;
    }
    writeJson(response, 503, { error: { code: 'FEATURE_UNAVAILABLE', message: 'Required authorization or workflow implementation is unavailable.',
      details: { decisionIds: route.decisionIds }, requestId, correlationId } }, requestId, correlationId);
    return;
  }

  if (
    path !== '/v1/health' &&
    path !== '/v1/me' &&
    path !== '/v1/me/memberships' &&
    path !== '/v1/auth/transactions' &&
    path !== '/v1/auth/session' &&
    path !== '/v1/auth/refresh' &&
    path !== '/v1/auth/revoke'
  ) {
    writeError(
      response,
      404,
      'NOT_FOUND',
      requestId,
      correlationId,
    );
    return;
  }

  if (
    path === '/v1/auth/transactions' ||
    path === '/v1/auth/session'
  ) {
    if (method !== 'POST') {
      writeError(
        response,
        405,
        'METHOD_NOT_ALLOWED',
        requestId,
        correlationId,
        { Allow: 'POST' },
      );
      return;
    }

    const parsedBody = await readJsonBody(
      request,
      path === '/v1/auth/transactions',
    );

    if (parsedBody.kind === 'ERROR') {
      writeError(
        response,
        parsedBody.status,
        parsedBody.code,
        requestId,
        correlationId,
      );
      return;
    }

    if (path === '/v1/auth/transactions') {
      const providerKey = readProviderKey(parsedBody.body);

      if (providerKey === null) {
        writeError(
          response,
          400,
          'INVALID_AUTH_PROVIDER',
          requestId,
          correlationId,
        );
        return;
      }

      try {
        const result =
          await dependencies.authTransactions.createTransaction(
            providerKey === undefined ? {} : { providerKey },
          );
        writeJson(
          response,
          201,
          { data: result },
          requestId,
          correlationId,
        );
      } catch (error) {
        if (error instanceof AuthTransactionServiceError) {
          writeAuthTransactionError(
            response,
            error,
            requestId,
            correlationId,
          );
          return;
        }

        throw error;
      }

      return;
    }

    const sessionInput = readCompleteAuthSession(
      parsedBody.body,
    );

    if (sessionInput === null) {
      writeError(
        response,
        400,
        'INVALID_AUTH_TRANSACTION',
        requestId,
        correlationId,
      );
      return;
    }

    try {
      const tokens =
        await dependencies.authTransactions.completeSession(
          sessionInput,
        );
      writeJson(
        response,
        200,
        { data: tokens },
        requestId,
        correlationId,
      );
    } catch (error) {
      if (error instanceof AuthTransactionServiceError) {
        writeAuthTransactionError(
          response,
          error,
          requestId,
          correlationId,
        );
        return;
      }

      throw error;
    }

    return;
  }

  if (
    path === '/v1/auth/refresh' ||
    path === '/v1/auth/revoke'
  ) {
    if (method !== 'POST') {
      writeError(
        response,
        405,
        'METHOD_NOT_ALLOWED',
        requestId,
        correlationId,
        { Allow: 'POST' },
      );
      return;
    }

    if (path === '/v1/auth/refresh') {
      const parsedBody = await readJsonBody(request);

      if (parsedBody.kind === 'ERROR') {
        writeError(
          response,
          parsedBody.status,
          parsedBody.code,
          requestId,
          correlationId,
        );
        return;
      }

      const refreshToken =
        readRefreshToken(parsedBody.body);

      if (!refreshToken) {
        writeError(
          response,
          400,
          'INVALID_REFRESH_TOKEN',
          requestId,
          correlationId,
        );
        return;
      }

      const result =
        await dependencies.sessions.refreshSession({
          refreshToken,
        });

      if (result.kind === 'ROTATED') {
        writeJson(
          response,
          200,
          { data: result.tokens },
          requestId,
          correlationId,
        );
        return;
      }

      switch (result.kind) {
        case 'INVALID':
          writeError(
            response,
            401,
            'INVALID_REFRESH_TOKEN',
            requestId,
            correlationId,
          );
          return;
        case 'REVOKED':
          writeError(
            response,
            401,
            'SESSION_REVOKED',
            requestId,
            correlationId,
          );
          return;
        case 'EXPIRED':
          writeError(
            response,
            401,
            'SESSION_EXPIRED',
            requestId,
            correlationId,
          );
          return;
        case 'REPLAY_DETECTED':
          writeError(
            response,
            401,
            'REFRESH_REPLAY_DETECTED',
            requestId,
            correlationId,
          );
          return;
      }
    }

    const accessToken =
      parseBearerAuthorizationHeader(
        readHeader(request, 'Authorization'),
      );

    if (!accessToken) {
      writeError(
        response,
        401,
        'UNAUTHENTICATED',
        requestId,
        correlationId,
      );
      return;
    }

    const result =
      await dependencies.sessions.revokeAccessSession({
        accessToken,
      });

    if (result.kind !== 'REVOKED') {
      writeError(
        response,
        401,
        'UNAUTHENTICATED',
        requestId,
        correlationId,
      );
      return;
    }

    writeNoContent(
      response,
      requestId,
      correlationId,
    );
    return;
  }

  if (method !== 'GET') {
    writeError(
      response,
      405,
      'METHOD_NOT_ALLOWED',
      requestId,
      correlationId,
      { Allow: 'GET' },
    );
    return;
  }

  if (path === '/v1/health') {
    writeJson(
      response,
      200,
      { data: { status: 'ok' } },
      requestId,
      correlationId,
    );
    return;
  }

  const authorizationHeader = readHeader(
    request,
    'Authorization',
  );

  if (path === '/v1/me/memberships') {
    const result = await handleAuthenticatedListMyMemberships(
      dependencies,
      {
        authorizationHeader,
        requestId,
        correlationId,
      },
    );
    writeHandlerResponse(
      response,
      result,
      requestId,
      correlationId,
    );
    return;
  }

  const workspaceHeader = readHeader(
    request,
    'X-Workspace-ID',
  );

  if (
    workspaceHeader !== undefined &&
    (typeof workspaceHeader !== 'string' ||
      !isUuid(workspaceHeader))
  ) {
    writeError(
      response,
      400,
      'INVALID_WORKSPACE_ID',
      requestId,
      correlationId,
    );
    return;
  }

  if (dependencies.resolvePersona) {
    const authenticated = await authenticateBearerIdentity(dependencies, { authorizationHeader });
    if (authenticated.kind === 'ERROR') {
      writeError(response, authenticated.status, authenticated.body.code, requestId, correlationId);
      return;
    }
    try {
      const data = await dependencies.resolvePersona(authenticated.identity, workspaceHeader);
      writeJson(response, 200, { data }, requestId, correlationId);
    } catch (error) {
      if (error instanceof Error && (error.message === 'UNAUTHENTICATED' || error.message === 'INVALID_AUTHORITY')) {
        writeError(response, error.message === 'UNAUTHENTICATED' ? 401 : 403, error.message, requestId, correlationId);
      } else throw error;
    }
    return;
  }
  const result = await handleAuthenticatedGetMe(
    dependencies,
    {
      authorizationHeader,
      requestId,
      correlationId,
      ...(workspaceHeader === undefined
        ? {}
        : { requestedTenantId: workspaceHeader }),
    },
  );
  writeHandlerResponse(
    response,
    result,
    requestId,
    correlationId,
  );
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: HttpServerDependencies,
): Promise<void> {
  const requestId = randomUUID();
  let correlationId: string = requestId;

  try {
    const correlation = resolveCorrelationId(
      request,
      requestId,
    );

    if (!correlation.ok) {
      writeError(
        response,
        400,
        'INVALID_CORRELATION_ID',
        requestId,
        correlationId,
      );
      return;
    }

    correlationId = correlation.correlationId;
    await dispatchRequest(
      request,
      response,
      dependencies,
      requestId,
      correlationId,
    );
  } catch {
    if (!response.headersSent) {
      writeError(
        response,
        500,
        'INTERNAL_ERROR',
        requestId,
        correlationId,
      );
      return;
    }

    response.destroy();
  }
}

export function createVioraHttpServer(
  dependencies: HttpServerDependencies,
): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, dependencies);
  });
}
