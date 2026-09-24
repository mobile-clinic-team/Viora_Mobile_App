import { domainRouteGates } from './domain-route-gates.ts';
import { PasswordAuthError } from '../../../libs/identity/application/src/password-auth.ts';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type {
  IncomingHttpHeaders,
  Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type {
  IdentityContextStore,
  IdentitySubjectReference,
  Membership,
  UserIdentity,
} from '../../../libs/identity/application-entrypoint/src/index.ts';
import type {
  RefreshSessionResult,
  RevokeAccessSessionResult,
} from '../../../libs/identity/application/src/session-service.ts';
import {
  authenticateWorkspaceRequestContext,
  authenticateWorkspaceRequestWithPermissions,
  createVioraHttpServer,
  validateWorkspacePermissionRevision,
} from './http-server.ts';
import { AuthTransactionServiceError } from '../../../libs/identity/application/src/auth-transaction-service.ts';
import type { HttpServerDependencies } from './http-server.ts';
import { createPatientApplicationDependencies } from './patient-composition.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('password HTTP routes enforce transport policy and safe error mappings', async () => {
  let failure: PasswordAuthError['code'] | undefined;
  const dependencies = { ...createDependencies([]), passwords: {
    async register() { if (failure) throw new PasswordAuthError(failure); return { registered: true }; },
    async login() { if (failure) throw new PasswordAuthError(failure); return { accessToken: validAccessToken, refreshToken: validRefreshToken, accessExpiresAt: '', refreshExpiresAt: '' }; },
  } };
  await withServer(dependencies, async port => {
    for (const path of ['/v1/auth/register', '/v1/auth/login']) {
      const result = await sendRequest(port, path, 'POST', { 'Content-Type': 'application/json' }, '{}');
      assert.equal(result.statusCode, path.endsWith('register') ? 201 : 200);
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal((await sendRequest(port, path, 'GET')).statusCode, 405);
      assert.equal((await sendRequest(port, path, 'POST', { 'Content-Type': 'text/plain' }, '{}')).statusCode, 400);
      assert.equal((await sendRequest(port, path, 'POST', { 'Content-Type': 'application/json' }, '{')).statusCode, 400);
      assert.equal((await sendRequest(port, path, 'POST', { 'Content-Type': 'application/json' }, ' '.repeat(16385))).statusCode, 413);
    }
    for (const [code, status] of Object.entries({ VALIDATION_ERROR: 400, DUPLICATE_IDENTITY: 409, INVALID_CREDENTIALS: 401, AUTH_BUSY: 503 })) {
      failure = code as PasswordAuthError['code'];
      const result = await sendRequest(port, '/v1/auth/login', 'POST', { 'Content-Type': 'application/json' }, '{}');
      assert.equal(result.statusCode, status);
      assert.equal((result.body as {error:{code:string}}).error.code, code);
    }
  });
});

test('persona failures never become Patient HTTP responses', async () => {
  for (const [message, status] of [['INVALID_AUTHORITY',403],['UNAUTHENTICATED',401],['database password secret',500]] as const) {
    await withServer({ ...createDependencies([]), async resolvePersona() { throw new Error(message); } }, async port => {
      const result = await sendRequest(port, '/v1/me', 'GET', { Authorization: `Bearer ${validAccessToken}` });
      assert.equal(result.statusCode, status);
      assert.ok(!result.rawBody.includes('PATIENT'));
      assert.ok(!result.rawBody.includes('secret'));
    });
  }
});

test('Patient self appointment routes require bearer identity, strict intent and configured booking service', async () => {
  let resolved = 0;
  let listed = 0;
  const dependencies: HttpServerDependencies = { ...createDependencies([]), selfAppointments: {
    async resolve(context) { resolved++; assert.equal(context.actor?.userId, userId); return [{ tenantId: tenantOneId, patientId: userId }]; },
    async list(context, url) { listed++; assert.equal(context.actor?.userId, userId); assert.equal(url.search, '');
      return { data: [{ id: userId, clinicName: 'Clinic A', doctorName: 'Doctor A', locationName: 'Room A',
        startsAt: '2026-10-01T08:00:00.000000Z', endsAt: '2026-10-01T08:30:00.000000Z', status: 'PENDING', reason: 'Visit' }],
      page: { hasMore: false, nextCursor: null } }; },
  } };
  const body = JSON.stringify({ doctorId: userId, locationId: tenantOneId, startsAt: '2026-10-01T08:00:00Z', reason: 'Visit' });
  const headers = { Authorization: `Bearer ${validAccessToken}`, 'Content-Type': 'application/json',
    'Idempotency-Key': '00000000-0000-4000-8000-000000000001', 'X-Operation-Created-At': '2026-09-23T00:00:00.000Z' };
  await withServer(dependencies, async port => {
    assert.equal((await sendRequest(port, '/v1/me/appointments', 'GET')).statusCode, 401);
    assert.equal((await sendRequest(port, '/v1/me/appointments', 'GET', { Authorization: `Bearer ${invalidAccessToken}` })).statusCode, 401);
    const read = await sendRequest(port, '/v1/me/appointments', 'GET', { Authorization: headers.Authorization });
    assert.equal(read.statusCode, 200);
    assert.equal((read.body as { data: unknown[] }).data.length, 1);
    const rejected = await sendRequest(port, '/v1/me/appointments', 'POST', headers,
      JSON.stringify({ ...JSON.parse(body) as object, patientId: tenantTwoId }));
    assert.equal(rejected.statusCode, 400);
    const blocked = await sendRequest(port, '/v1/me/appointments', 'POST', headers, body);
    assert.equal(blocked.statusCode, 503);
    assert.deepEqual((blocked.body as { error: { details: { decisionIds: string[] } } }).error.details.decisionIds, []);
  });
  assert.equal(listed, 1);
  assert.equal(resolved, 0);
  const receipt = { operationId: headers['Idempotency-Key'], state: 'SUCCEEDED' as const,
    primary: { type: 'APPOINTMENT' as const, id: userId, parentId: null, versionToken: '"1"' },
    related: [], handoff: null, committedAt: '2026-09-23T00:00:00.000Z', expiresAt: '2026-09-24T00:00:00.000Z' };
  let created = 0;
  await withServer({ ...dependencies, selfBooking: {
    async create(context, authenticatedSession, input, key, timestamp) {
      created++; assert.equal(context.actor?.userId, userId); assert.equal(context.tenant, null);
      assert.equal(authenticatedSession, sessionId); assert.deepEqual(input, JSON.parse(body));
      assert.equal(key, receipt.operationId); assert.equal(timestamp, headers['X-Operation-Created-At']); return receipt;
    },
    async recover(context, authenticatedSession, key) {
      assert.equal(context.actor?.userId, userId); assert.equal(authenticatedSession, sessionId);
      assert.equal(key, receipt.operationId); return receipt;
    },
    async options() { return { data: [], durationMinutes: 30 }; },
  } }, async port => {
    for (const field of ['patientId', 'userId', 'tenantId', 'membershipId', 'status', 'role', 'persona', 'allowedActions', 'auditActor']) {
      assert.equal((await sendRequest(port, '/v1/me/appointments', 'POST', headers,
        JSON.stringify({ ...JSON.parse(body) as object, [field]: userId }))).statusCode, 400);
    }
    for (const path of ['/v1/me/appointments/options', `/v1/me/appointment-operations/${receipt.operationId}`]) {
      assert.equal((await sendRequest(port, path, 'GET')).statusCode, 401);
      assert.equal((await sendRequest(port, `${path}?userId=${userId}`, 'GET', headers)).statusCode, 400);
    }
    assert.equal((await sendRequest(port, '/v1/me/appointments', 'POST', { ...headers, Authorization: `Bearer ${invalidAccessToken}` }, body)).statusCode, 401);
    const booked = await sendRequest(port, '/v1/me/appointments', 'POST', headers, body);
    assert.equal(booked.statusCode, 201); assert.equal(booked.headers.etag, '"1"');
    assert.deepEqual(booked.body, { data: receipt }); assert.equal(created, 1);
    const recovered = await sendRequest(port, `/v1/me/appointment-operations/${receipt.operationId}`, 'GET', headers);
    assert.equal(recovered.statusCode, 200); assert.equal(recovered.headers.etag, '"1"');
    assert.deepEqual(recovered.body, booked.body);
  });
  await withServer({ ...dependencies, selfAppointments: {
    ...dependencies.selfAppointments!, async list() { throw new Error('private database detail'); },
  } }, async port => {
    const failure = await sendRequest(port, '/v1/me/appointments', 'GET', { Authorization: headers.Authorization });
    assert.equal(failure.statusCode, 500);
    assert.equal(failure.rawBody.includes('private database detail'), false);
  });
});

const userId = '00000000-0000-0000-0000-000000000901';
const sessionId = '00000000-0000-0000-0000-000000000902';
const membershipOneId = '00000000-0000-0000-0000-000000000911';
const membershipTwoId = '00000000-0000-0000-0000-000000000912';
const tenantOneId = '00000000-0000-0000-0000-000000000921';
const tenantTwoId = '00000000-0000-0000-0000-000000000922';

const subject: IdentitySubjectReference = {
  issuer: 'https://issuer.example.test',
  subject: 'http-user-901',
};

const user: UserIdentity = {
  id: userId,
  status: 'ACTIVE',
  subject,
};

const activeMembership: Membership = {
  id: membershipOneId,
  userId,
  tenantId: tenantOneId,
  role: 'CLINIC_ADMIN',
  status: 'ACTIVE',
  permissionRevision: '"1"',
};

const secondActiveMembership: Membership = {
  id: membershipTwoId,
  userId,
  tenantId: tenantTwoId,
  role: 'ADMIN',
  status: 'ACTIVE',
  permissionRevision: '"1"',
};

const suspendedMembership: Membership = {
  ...secondActiveMembership,
  status: 'SUSPENDED',
};

const validAccessToken =
  `viora_access_v1.${sessionId}.${'a'.repeat(43)}`;
const invalidAccessToken =
  `viora_access_v1.00000000-0000-0000-0000-000000000903.${'b'.repeat(43)}`;
const validRefreshToken =
  `viora_refresh_v1.00000000-0000-0000-0000-000000000904.${'c'.repeat(43)}`;

interface DependencyOptions {
  readonly refreshResult?: RefreshSessionResult;
  readonly revokeResult?: RevokeAccessSessionResult;
}

interface HttpResponse {
  readonly statusCode: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: unknown;
  readonly rawBody: string;
}

function createDependencies(
  memberships: readonly Membership[],
  throwOnIdentityLookup = false,
  options: DependencyOptions = {},
): HttpServerDependencies {
  const identities: IdentityContextStore = {
    async findUserBySubject(requestedSubject) {
      if (throwOnIdentityLookup) {
        throw new Error('sensitive database error');
      }

      return requestedSubject.issuer === subject.issuer &&
        requestedSubject.subject === subject.subject
        ? user
        : null;
    },
    async findMembershipsByUser(requestedUserId) {
      return requestedUserId === user.id ? memberships : [];
    },
  };

  return {
    identities,
    patientDirectoryCursor: null,
    patients: {
      async searchDirectory() { throw new Error('unexpected Patient directory read'); },
      async findById() { throw new Error('unexpected Patient read'); },
      async findByMedicalRecordNumber() { throw new Error('unexpected Patient read'); },
      async listByTenant() { throw new Error('unexpected Patient read'); },
      async create() { throw new Error('unexpected Patient mutation'); },
      async update() { throw new Error('unexpected Patient mutation'); },
    },
    idempotency: {
      async lookup() { throw new Error('unexpected idempotency access'); },
      async begin() { throw new Error('unexpected idempotency access'); },
      async complete() { throw new Error('unexpected idempotency access'); },
      async fail() { throw new Error('unexpected idempotency access'); },
    },
    membershipGrants: {
      async listPermissions() {
        return [];
      },
    },
    authTransactions: {
      async createTransaction() { throw new Error('auth unavailable in this fixture'); },
      async completeSession() { throw new Error('auth unavailable in this fixture'); },
    },
    sessions: {
      async authenticateAccessToken({ accessToken }) {
        if (accessToken !== validAccessToken) {
          return { kind: 'INVALID' as const };
        }

        return {
          kind: 'AUTHENTICATED' as const,
          sessionId,
          userId,
          subject,
          accessExpiresAt: '2026-09-19T02:10:00.000Z',
          expiresAt: '2026-09-19T13:00:00.000Z',
        };
      },
      async refreshSession(_request) {
        return options.refreshResult ?? { kind: 'INVALID' };
      },
      async revokeAccessSession(_request) {
        return options.revokeResult ?? { kind: 'INVALID' };
      },
    },
  };
}

async function startServer(
  dependencies: HttpServerDependencies,
): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createVioraHttpServer(dependencies);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP server address');
  }

  return {
    server,
    port: (address as AddressInfo).port,
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function withServer<T>(
  dependencies: HttpServerDependencies,
  callback: (port: number) => Promise<T>,
): Promise<T> {
  const { server, port } = await startServer(dependencies);

  try {
    return await callback(port);
  } finally {
    await closeServer(server);
  }
}

async function sendRequest(
  port: number,
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const client = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (response) => {
        let rawBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          rawBody += chunk;
        });
        response.on('end', () => {
          try {
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers,
              body: rawBody === ''
                ? null
                : JSON.parse(rawBody) as unknown,
              rawBody,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    client.on('error', reject);
    if (body !== undefined) {
      client.write(body);
    }
    client.end();
  });
}

function header(response: HttpResponse, name: string): string {
  const value = response.headers[name];

  if (typeof value !== 'string') {
    throw new Error(`missing ${name} response header`);
  }

  return value;
}

test('Patient routes remain unavailable and existing reads do not touch Patient or idempotency stores', async (t) => {
  const dependencies = createDependencies([activeMembership]);
  const patientCalls = (['findById', 'findByMedicalRecordNumber', 'listByTenant', 'searchDirectory', 'create', 'update'] as const)
    .map((method) => t.mock.method(dependencies.patients, method));
  const idempotencyCalls = (['lookup', 'begin', 'complete', 'fail'] as const)
    .map((method) => t.mock.method(dependencies.idempotency, method));
  await withServer(dependencies, async (port) => {
    const headers = {
      Authorization: `Bearer ${validAccessToken}`,
      'X-Workspace-ID': tenantOneId,
      'X-Permission-Revision': '"1"',
    };
    for (const [method, path] of [
      ['GET', '/v1/patients'], ['GET', `/v1/patients/${userId}`],
      ['POST', '/v1/patients'], ['PATCH', `/v1/patients/${userId}`],
    ]) {
      const response = await sendRequest(port, path, method, headers);
      assert.equal(response.statusCode, 503);
    }
    for (const path of ['/v1/health', '/v1/me', '/v1/me/memberships']) {
      assert.equal((await sendRequest(port, path, 'GET', headers)).statusCode, 200);
    }
  });
  for (const call of [...patientCalls, ...idempotencyCalls]) assert.equal(call.mock.callCount(), 0);
});

test('ADMIN membership without grants cannot gain Patient read access during request composition', async () => {
  let grantReads = 0;
  const dependencies = {
    ...createDependencies([secondActiveMembership]),
    membershipGrants: { async listPermissions() { grantReads += 1; return []; } },
  };
  const authenticated = await authenticateWorkspaceRequestWithPermissions(dependencies, {
    authorizationHeader: `Bearer ${validAccessToken}`, workspaceHeader: tenantTwoId,
    permissionRevisionHeader: '"1"', requestId: 'request-1', correlationId: 'correlation-1',
  });
  assert.equal(authenticated.kind, 'AUTHENTICATED');
  if (authenticated.kind === 'AUTHENTICATED') {
    const patientDependencies = createPatientApplicationDependencies(dependencies, authenticated.permissions);
    assert.equal(patientDependencies.authorization.allows({ action: 'patient.read', context: authenticated.context }), false);
  }
  assert.equal(grantReads, 1);
});

function assertRequestHeaders(response: HttpResponse): void {
  assert.equal(
    header(response, 'content-type'),
    'application/json; charset=utf-8',
  );
  assert.equal(header(response, 'cache-control'), 'no-store');
  assert.match(header(response, 'x-request-id'), UUID_PATTERN);
  assert.match(header(response, 'x-correlation-id'), UUID_PATTERN);
}

test(
  'workspace permission revision validation fails closed and detects stale context',
  () => {
    const currentRevision =
      activeMembership.permissionRevision;

    assert.equal(
      validateWorkspacePermissionRevision(
        undefined,
        currentRevision,
      ),
      'INVALID',
    );

    assert.equal(
      validateWorkspacePermissionRevision(
        ['"1"', '"1"'],
        currentRevision,
      ),
      'INVALID',
    );

    assert.equal(
      validateWorkspacePermissionRevision(
        '1',
        currentRevision,
      ),
      'INVALID',
    );

    assert.equal(
      validateWorkspacePermissionRevision(
        'W/"1"',
        currentRevision,
      ),
      'INVALID',
    );

    assert.equal(
      validateWorkspacePermissionRevision(
        '"1"',
        currentRevision,
      ),
      'VALID',
    );

    assert.equal(
      validateWorkspacePermissionRevision(
        '"2"',
        currentRevision,
      ),
      'STALE',
    );
  },
);

test(
  'workspace request context authenticates and enforces permission revision',
  async () => {
    const dependencies =
      createDependencies([activeMembership]);

    const baseInput = {
      authorizationHeader:
        `Bearer ${validAccessToken}`,
      workspaceHeader: tenantOneId,
      requestId:
        '00000000-0000-0000-0000-000000000991',
      correlationId:
        '00000000-0000-0000-0000-000000000992',
    };

    const valid =
      await authenticateWorkspaceRequestContext(
        dependencies,
        {
          ...baseInput,
          permissionRevisionHeader: '"1"',
        },
      );

    assert.equal(valid.kind, 'AUTHENTICATED');

    if (valid.kind === 'AUTHENTICATED') {
      const tenant = valid.context.tenant;

      assert.ok(tenant);

      assert.equal(
        tenant.tenantId,
        tenantOneId,
      );
      assert.equal(
        tenant.membershipId,
        membershipOneId,
      );
      assert.equal(
        tenant.permissionRevision,
        '"1"',
      );
    }

    const missingRevision =
      await authenticateWorkspaceRequestContext(
        dependencies,
        {
          ...baseInput,
          permissionRevisionHeader: undefined,
        },
      );

    assert.deepEqual(missingRevision, {
      kind: 'ERROR',
      status: 400,
      body: {
        code: 'INVALID_PERMISSION_REVISION',
      },
    });

    const duplicateRevision =
      await authenticateWorkspaceRequestContext(
        dependencies,
        {
          ...baseInput,
          permissionRevisionHeader: ['"1"', '"1"'],
        },
      );

    assert.deepEqual(duplicateRevision, {
      kind: 'ERROR',
      status: 400,
      body: {
        code: 'INVALID_PERMISSION_REVISION',
      },
    });

    const stale =
      await authenticateWorkspaceRequestContext(
        dependencies,
        {
          ...baseInput,
          permissionRevisionHeader: '"2"',
        },
      );

    assert.deepEqual(stale, {
      kind: 'ERROR',
      status: 409,
      body: {
        code: 'CONTEXT_STALE',
      },
    });

    const invalidWorkspace =
      await authenticateWorkspaceRequestContext(
        dependencies,
        {
          ...baseInput,
          workspaceHeader: 'not-a-uuid',
          permissionRevisionHeader: '"1"',
        },
      );

    assert.deepEqual(invalidWorkspace, {
      kind: 'ERROR',
      status: 400,
      body: {
        code: 'INVALID_WORKSPACE_ID',
      },
    });
  },
);
test(
  'workspace permissions load only after valid authenticated context',
  async () => {
    let grantReads = 0;

    const dependencies = {
      ...createDependencies([activeMembership]),
      membershipGrants: {
        async listPermissions(input: {
          readonly tenantId: string;
          readonly membershipId: string;
        }) {
          grantReads += 1;

          assert.deepEqual(input, {
            tenantId: tenantOneId,
            membershipId: membershipOneId,
          });

          return [
            'patient.read',
            'patient.read',
          ];
        },
      },
    };

    const baseInput = {
      authorizationHeader:
        `Bearer ${validAccessToken}`,
      workspaceHeader: tenantOneId,
      requestId:
        '00000000-0000-0000-0000-000000000993',
      correlationId:
        '00000000-0000-0000-0000-000000000994',
    };

    const valid =
      await authenticateWorkspaceRequestWithPermissions(
        dependencies,
        {
          ...baseInput,
          permissionRevisionHeader: '"1"',
        },
      );

    assert.equal(valid.kind, 'AUTHENTICATED');

    if (valid.kind === 'AUTHENTICATED') {
      assert.equal(
        valid.permissions.has('patient.read'),
        true,
      );
      assert.equal(valid.permissions.size, 1);
      const patientDependencies = createPatientApplicationDependencies(dependencies, valid.permissions);
      assert.equal(patientDependencies.authorization.allows({ action: 'patient.read', context: valid.context }), true);
      assert.equal(patientDependencies.patients, dependencies.patients);
      assert.equal(patientDependencies.idempotency, dependencies.idempotency);
    }

    assert.equal(grantReads, 1);

    const stale =
      await authenticateWorkspaceRequestWithPermissions(
        dependencies,
        {
          ...baseInput,
          permissionRevisionHeader: '"2"',
        },
      );

    assert.deepEqual(stale, {
      kind: 'ERROR',
      status: 409,
      body: {
        code: 'CONTEXT_STALE',
      },
    });

    assert.equal(grantReads, 1);

    const invalidToken =
      await authenticateWorkspaceRequestWithPermissions(
        dependencies,
        {
          ...baseInput,
          authorizationHeader:
            `Bearer ${invalidAccessToken}`,
          permissionRevisionHeader: '"1"',
        },
      );

    assert.equal(
      invalidToken.kind,
      'ERROR',
    );

    assert.equal(grantReads, 1);
  },
);
test('auth transaction is public, returns only client-safe fields and no-store', async () => {
  const dependencies = createDependencies([]);
  const authorization = { transactionId: sessionId, authorizationUrl: 'https://accounts.google.com/auth', state: 'test-state', expiresAt: '2026-09-19T12:00:00.000Z' };
  const response = await withServer({ ...dependencies, authTransactions: {
    ...dependencies.authTransactions,
    async createTransaction(input) { assert.deepEqual(input, { providerKey: 'google' }); return authorization; },
  } }, port => sendRequest(port, '/v1/auth/transactions', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ provider: 'google' })));
  assert.equal(response.statusCode, 201); assert.deepEqual(response.body, { data: authorization }); assertRequestHeaders(response);
  assert.doesNotMatch(response.rawBody, /verifier|nonceCiphertext|stateHash/);
});

test('auth session accepts only transaction, code and state and returns token bundle', async () => {
  const dependencies = createDependencies([]);
  const body = { transactionId: sessionId, code: 'test-code', state: 'test-state' };
  const tokens = { accessToken: 'test-access', refreshToken: 'test-refresh', accessExpiresAt: '2026-09-19T12:00:00.000Z', refreshExpiresAt: '2026-09-20T00:00:00.000Z' };
  const response = await withServer({ ...dependencies, authTransactions: { ...dependencies.authTransactions,
    async completeSession(input) { assert.deepEqual(input, body); return tokens; },
  } }, port => sendRequest(port, '/v1/auth/session', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(body)));
  assert.equal(response.statusCode, 200); assert.deepEqual(response.body, { data: tokens }); assertRequestHeaders(response);
});

for (const [code, status] of [
  ['INVALID_AUTH_PROVIDER', 400], ['AUTH_PROVIDER_UNAVAILABLE', 503],
  ['INVALID_AUTH_TRANSACTION', 400], ['AUTH_TRANSACTION_EXPIRED', 401],
  ['AUTH_TRANSACTION_REPLAY', 401], ['OIDC_VERIFICATION_FAILED', 401], ['IDENTITY_NOT_PROVISIONED', 403],
] as const) {
  test(`auth maps ${code} to ${status} without internal details`, async () => {
    const dependencies = createDependencies([]);
    const response = await withServer({ ...dependencies, authTransactions: {
      ...dependencies.authTransactions, async completeSession() { throw new AuthTransactionServiceError(code); },
    } }, port => sendRequest(port, '/v1/auth/session', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ transactionId: sessionId, code: 'test-code', state: 'test-state' })));
    assert.equal(response.statusCode, status); assert.equal((response.body as { error: { code: string } }).error.code, code); assertRequestHeaders(response);
  });
}

test('auth rejects client identity, role, issuer and purpose overrides before service invocation', async () => {
  await withServer(createDependencies([]), async port => {
    for (const field of ['userId', 'role', 'issuer', 'subject', 'tenantId', 'membershipId', 'purpose']) {
      const response = await sendRequest(port, '/v1/auth/session', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ transactionId: sessionId, code: 'code', state: 'state', [field]: 'attacker' }));
      assert.equal(response.statusCode, 400);
    }
    const transaction = await sendRequest(port, '/v1/auth/transactions', 'POST', { 'Content-Type': 'application/json' }, '{"userId":"attacker"}');
    assert.equal(transaction.statusCode, 400);
  });
});

test('auth routes enforce method, JSON, body limit and input bounds', async () => {
  await withServer(createDependencies([]), async port => {
    for (const path of ['/v1/auth/transactions', '/v1/auth/session']) {
      assert.equal((await sendRequest(port, path, 'GET')).statusCode, 405);
      assert.equal((await sendRequest(port, path, 'POST', { 'Content-Type': 'application/json' }, '{')).statusCode, 400);
      assert.equal((await sendRequest(port, path, 'POST', { 'Content-Type': 'application/json' }, ' '.repeat(16385))).statusCode, 413);
    }
    assert.equal((await sendRequest(port, '/v1/auth/session', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ transactionId: sessionId, code: 'x'.repeat(4097), state: 'state' }))).statusCode, 400);
  });
});

test('missing provider fails closed while health remains available', async () => {
  const dependencies = createDependencies([]);
  await withServer({ ...dependencies, authTransactions: { ...dependencies.authTransactions,
    async createTransaction() { throw new AuthTransactionServiceError('AUTH_PROVIDER_UNAVAILABLE'); },
  } }, async port => {
    assert.equal((await sendRequest(port, '/v1/auth/transactions', 'POST', { 'Content-Type': 'application/json' }, '{}')).statusCode, 503);
    assert.equal((await sendRequest(port, '/v1/health', 'GET')).statusCode, 200);
  });
});

test('GET /v1/health returns a JSON health envelope', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/health', 'GET'),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { data: { status: 'ok' } });
  assertRequestHeaders(response);
});

test('GET /v1/me authenticates a valid bearer and workspace', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(port, '/v1/me', 'GET', {
        Authorization: `Bearer ${validAccessToken}`,
        'X-Workspace-ID': tenantOneId,
      }),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    data: {
      actor: {
        userId,
        subject,
        status: 'ACTIVE',
      },
      membership: activeMembership,
      tenant: {
        tenantId: tenantOneId,
        membershipId: membershipOneId,
      },
    },
  });
  assertRequestHeaders(response);
});

test('GET /v1/me rejects a missing Authorization header', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/me', 'GET'),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
      details: null,
      requestId: header(response, 'x-request-id'),
      correlationId: header(response, 'x-correlation-id'),
    },
  });
  assertRequestHeaders(response);
});

test('GET /v1/me requires workspace selection for ambiguous memberships', async () => {
  const response = await withServer(
    createDependencies([activeMembership, secondActiveMembership]),
    (port) =>
      sendRequest(port, '/v1/me', 'GET', {
        Authorization: `Bearer ${validAccessToken}`,
      }),
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'TENANT_CONTEXT_REQUIRED',
  );
  assertRequestHeaders(response);
});

test('GET /v1/me rejects a malformed workspace header', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(port, '/v1/me', 'GET', {
        'X-Workspace-ID': 'not-a-uuid',
      }),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INVALID_WORKSPACE_ID',
  );
  assertRequestHeaders(response);
});

test('GET /v1/me/memberships does not require a workspace header', async () => {
  const response = await withServer(
    createDependencies([activeMembership, suspendedMembership]),
    (port) =>
      sendRequest(port, '/v1/me/memberships', 'GET', {
        Authorization: `Bearer ${validAccessToken}`,
      }),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { data: [activeMembership] });
  assertRequestHeaders(response);
});

test('GET /v1/me/memberships rejects an invalid access token', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(port, '/v1/me/memberships', 'GET', {
        Authorization: `Bearer ${invalidAccessToken}`,
      }),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'UNAUTHENTICATED',
  );
  assertRequestHeaders(response);
});

test('POST /v1/me returns method not allowed with Allow GET', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/me', 'POST'),
  );

  assert.equal(response.statusCode, 405);
  assert.equal(header(response, 'allow'), 'GET');
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'METHOD_NOT_ALLOWED',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/session validates its JSON contract', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/auth/session', 'POST'),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INVALID_JSON',
  );
  assertRequestHeaders(response);
});

test('GET an unknown path returns not found', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/unknown', 'GET'),
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'NOT_FOUND',
  );
  assertRequestHeaders(response);
});

test('GET /v1/health preserves one valid incoming correlation ID', async () => {
  const correlationId = '00000000-0000-0000-0000-000000000991';
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(port, '/v1/health', 'GET', {
        'X-Correlation-ID': correlationId,
      }),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(header(response, 'x-correlation-id'), correlationId);
  assertRequestHeaders(response);
});

test('unexpected identity errors return a safe internal error', async () => {
  const response = await withServer(
    createDependencies([activeMembership], true),
    (port) =>
      sendRequest(port, '/v1/me', 'GET', {
        Authorization: `Bearer ${validAccessToken}`,
      }),
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INTERNAL_ERROR',
  );
  assert.equal(response.rawBody.includes('sensitive database error'), false);
  assertRequestHeaders(response);
});

test('POST /v1/auth/refresh rotates a valid refresh token', async () => {
  const tokens = {
    accessToken: validAccessToken,
    refreshToken: validRefreshToken,
    accessExpiresAt: '2026-09-19T02:10:00.000Z',
    refreshExpiresAt: '2026-09-19T13:00:00.000Z',
  };

  const response = await withServer(
    createDependencies([activeMembership], false, {
      refreshResult: {
        kind: 'ROTATED',
        tokens,
      },
    }),
    (port) =>
      sendRequest(
        port,
        '/v1/auth/refresh',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ refreshToken: validRefreshToken }),
      ),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { data: tokens });
  assertRequestHeaders(response);
});

test('POST /v1/auth/refresh rejects an invalid token', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(
        port,
        '/v1/auth/refresh',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ refreshToken: 'invalid-refresh-token' }),
      ),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INVALID_REFRESH_TOKEN',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/refresh rejects refresh-token replay', async () => {
  const response = await withServer(
    createDependencies([activeMembership], false, {
      refreshResult: { kind: 'REPLAY_DETECTED' },
    }),
    (port) =>
      sendRequest(
        port,
        '/v1/auth/refresh',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ refreshToken: validRefreshToken }),
      ),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'REFRESH_REPLAY_DETECTED',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/refresh rejects malformed JSON', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(
        port,
        '/v1/auth/refresh',
        'POST',
        { 'Content-Type': 'application/json' },
        '{"refreshToken":',
      ),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INVALID_JSON',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/refresh rejects a missing refreshToken', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(
        port,
        '/v1/auth/refresh',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({}),
      ),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INVALID_REFRESH_TOKEN',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/revoke revokes a valid Bearer session', async () => {
  const response = await withServer(
    createDependencies([activeMembership], false, {
      revokeResult: { kind: 'REVOKED' },
    }),
    (port) =>
      sendRequest(port, '/v1/auth/revoke', 'POST', {
        Authorization: `Bearer ${validAccessToken}`,
      }),
  );

  assert.equal(response.statusCode, 204);
  assert.equal(response.rawBody, '');
  assert.equal(response.body, null);
  assert.equal(response.headers['content-type'], undefined);
  assert.equal(header(response, 'cache-control'), 'no-store');
  assert.match(header(response, 'x-request-id'), UUID_PATTERN);
  assert.match(header(response, 'x-correlation-id'), UUID_PATTERN);
});

test('POST /v1/auth/revoke rejects a missing Bearer session', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/auth/revoke', 'POST'),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'UNAUTHENTICATED',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/transactions validates its JSON contract', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) => sendRequest(port, '/v1/auth/transactions', 'POST'),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'INVALID_JSON',
  );
  assertRequestHeaders(response);
});

test('POST /v1/auth/refresh rejects an oversized body', async () => {
  const response = await withServer(
    createDependencies([activeMembership]),
    (port) =>
      sendRequest(
        port,
        '/v1/auth/refresh',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ refreshToken: 'x'.repeat(16 * 1024) }),
      ),
  );

  assert.equal(response.statusCode, 413);
  assert.deepEqual(
    (response.body as { readonly error: { readonly code: string } }).error.code,
    'PAYLOAD_TOO_LARGE',
  );
  assertRequestHeaders(response);
});


test('Phase 5B domain routes authenticate once and fail closed without domain access', async () => {
  const base = createDependencies([activeMembership]);
  let grantLoads = 0;
  const dependencies = { ...base, membershipGrants: { async listPermissions() { grantLoads++; return ['doctor.read','patient.read','appointment.read','record.read','encounter.read']; } } };
  await withServer(dependencies, async port => {
    const headers = { Authorization: 'Bearer ' + validAccessToken, 'X-Workspace-ID': tenantOneId, 'X-Permission-Revision': '"1"' };
    for (const route of domainRouteGates.filter(route => !(route.method === 'GET' && ['/v1/patients', '/v1/patients/{id}'].includes(route.path)))) {
      const path = route.path.replace(/\{\w+\}/g, tenantOneId);
      const before = grantLoads;
      const response = await sendRequest(port, path, route.method, headers);
      assert.equal(response.statusCode, 503, route.method + ' ' + path);
      assert.equal(grantLoads, before + 1);
      const body = response.body as { error: { code: string; details: { decisionIds: readonly string[] } } };
      assert.equal(body.error.code, 'FEATURE_UNAVAILABLE');
      assert.deepEqual(body.error.details.decisionIds, route.decisionIds);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers.etag, undefined);
    }
    const before = grantLoads;
    assert.equal((await sendRequest(port, '/v1/doctors', 'GET', { ...headers, Authorization: 'Bearer invalid' })).statusCode, 401);
    const stale = await sendRequest(port, '/v1/doctors', 'GET', { ...headers, 'X-Permission-Revision': '"0"' });
    assert.equal(stale.statusCode, 409);
    assert.equal((stale.body as {error:{code:string}}).error.code, 'CONTEXT_STALE');
    assert.equal((await sendRequest(port, '/v1/doctors', 'GET', { ...headers, 'X-Permission-Revision': 'bad' })).statusCode, 400);
    assert.equal((await sendRequest(port, '/v1/doctors', 'GET', { ...headers, 'X-Workspace-ID': userId })).statusCode, 403);
    assert.equal(grantLoads, before);
    assert.equal((await sendRequest(port, '/v1/doctors', 'DELETE', headers)).statusCode, 405);
    assert.equal((await sendRequest(port, '/api/v1/doctors', 'GET', headers)).statusCode, 404);
  });
});

test('BD-01 Patient HTTP reads enforce canonical roles, live grants, projection, audit and revocation', async () => {
  const membership = { ...activeMembership };
  let grants = ['patient.read', 'record.read'];
  let auditFails = false;
  let foreign = false;
  let patientReads = 0;
  const events: import('../../../libs/audit/contracts/src/index.ts').AuditEvent[] = [];
  const patient = { patientId: sessionId, tenantId: tenantOneId, userId, medicalRecordNumber: 'SYNTHETIC-MRN',
    fullName: 'Synthetic Patient', dateOfBirth: '1990-01-01', sex: 'UNKNOWN', phone: 'synthetic-phone',
    email: 'synthetic@example.test', address: 'synthetic-address', emergencyContact: 'legacy-contact',
    status: 'ACTIVE', version: 1n, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z',
    clinicalNotes: 'MUST NOT LEAK', futureField: 'MUST NOT LEAK' } as const;
  const base = createDependencies([membership]);
  const dependencies: HttpServerDependencies = { ...base,
    membershipGrants: { async listPermissions() { return grants; } },
    audit: { async append(event) { if (auditFails) throw new Error('unavailable'); events.push(event); } },
    patientDirectoryCursor: { encode() { return 'opaque'; }, decode() { throw new Error('invalid'); } },
    patients: { ...base.patients,
      async findById(input) { patientReads++; assert.equal(input.tenantId, tenantOneId); return foreign ? { ...patient, tenantId: tenantTwoId } : patient; },
      async searchDirectory(input) { patientReads++; assert.equal(input.tenantId, tenantOneId); return [patient]; },
    },
  };
  await withServer(dependencies, async port => {
    const headers = { Authorization: 'Bearer ' + validAccessToken, 'X-Workspace-ID': tenantOneId, 'X-Permission-Revision': '"1"' };
    const detail = () => sendRequest(port, '/v1/patients/' + sessionId, 'GET', headers);
    let response = await detail();
    assert.equal(response.statusCode, 200);
    const data = (response.body as { data: Record<string, unknown> }).data;
    assert.equal(data.fullName, patient.fullName);
    assert.equal(data.versionToken, response.headers.etag);
    for (const field of ['clinicalNotes', 'futureField', 'userId', 'emergencyContact', 'status']) assert.equal(Object.hasOwn(data, field), false);
    assert.deepEqual(data.access, { allowedActions: ['patient.read'] });
    assert.equal(events.at(-1)?.result, 'SUCCESS');
    assert.equal(events.at(-1)?.actorId, userId);
    assert.equal(JSON.stringify(events).includes('synthetic'), false);
    assert.equal((await sendRequest(port, '/v1/patients?q=Sy', 'GET', headers)).statusCode, 200);
    for (const query of ['', '?q=Sy&role=DOCTOR', '?q=Sy&q=Other', '?q=Sy&limit=1.5']) {
      assert.equal((await sendRequest(port, '/v1/patients' + query, 'GET', headers)).statusCode, 400);
    }
    const before = patientReads;
    grants = [];
    assert.equal((await detail()).statusCode, 403);
    assert.equal(events.at(-1)?.result, 'DENIED');
    assert.equal(patientReads, before);
    grants = ['patient.read'];
    for (const role of ['DOCTOR', 'RECEPTIONIST', 'ADMIN', 'UNKNOWN']) {
      membership.role = role;
      assert.equal((await detail()).statusCode, 403, role);
    }
    membership.role = 'NURSE';
    assert.equal((await detail()).statusCode, 200);
    foreign = true;
    response = await detail();
    assert.equal(response.statusCode, 404);
    assert.equal(response.rawBody.includes(patient.fullName), false);
    foreign = false;
    auditFails = true;
    response = await detail();
    assert.equal(response.statusCode, 503);
    assert.equal((response.body as {error:{code:string}}).error.code, 'AUDIT_UNAVAILABLE');
    assert.equal(response.rawBody.includes(patient.fullName), false);
    auditFails = false;
    membership.permissionRevision = '"2"';
    assert.equal((await detail()).statusCode, 409);
    membership.permissionRevision = '"1"';
    membership.status = 'REVOKED';
    assert.equal((await detail()).statusCode, 403);
  });
});


test('BD-01 Pass 2 Doctor HTTP read uses only persisted relationships and next-request revocation', async () => {
  const base = createDependencies([{ ...activeMembership, role: 'DOCTOR' }]);
  let active = false;
  let failAudit = false;
  let workspace = tenantOneId;
  const patient = { patientId: sessionId, tenantId: tenantOneId, userId, medicalRecordNumber: 'SYNTHETIC',
    fullName: 'Synthetic Patient', dateOfBirth: '1990-01-01', sex: 'UNKNOWN', phone: '', email: '', address: '',
    emergencyContact: 'hidden', status: 'ACTIVE', version: 1n, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } as const;
  const deps: HttpServerDependencies = { ...base,
    membershipGrants: { async listPermissions() { return ['patient.read']; } },
    careAccess: { async hasActive(scope) {
      assert.equal(scope.membershipId, membershipOneId); assert.equal(scope.patientId, sessionId);
      assert.equal(scope.userId, userId); assert.equal(scope.kind, 'DOCTOR_RELATIONSHIP');
      return active && scope.tenantId === workspace;
    } },
    audit: { async append() { if (failAudit) throw new Error('audit unavailable'); } },
    patients: { ...base.patients, async findById() { return patient; } },
  };
  await withServer(deps, async port => {
    const headers = { Authorization: 'Bearer ' + validAccessToken, 'X-Workspace-ID': tenantOneId, 'X-Permission-Revision': '"1"' };
    const detail = () => sendRequest(port, '/v1/patients/' + sessionId, 'GET', headers);
    assert.equal((await detail()).statusCode, 403);
    assert.notEqual((await sendRequest(port, '/v1/patients/' + sessionId + '?relationship=ACTIVE', 'GET', headers)).statusCode, 200);
    assert.equal((await sendRequest(port, '/v1/patients/' + sessionId, 'GET', { ...headers, 'X-Care-Relationship': 'ACTIVE', 'Content-Length': '25' }, '{"relationship":"ACTIVE"}')).statusCode, 403);
    active = true;
    const response = await detail();
    assert.equal(response.statusCode, 200);
    assert.equal(response.rawBody.includes('hidden'), false);
    failAudit = true;
    assert.equal((await detail()).statusCode, 503);
    failAudit = false;
    active = false;
    assert.equal((await detail()).statusCode, 403);
    active = true; workspace = tenantTwoId;
    assert.equal((await detail()).statusCode, 403);
  });
});

test('BD-02 Patient HTTP mutations remain gated and DELETE is unavailable', async () => {
  const base = createDependencies([activeMembership]);
  let grantLoads = 0;

  const dependencies = {
    ...base,
    membershipGrants: {
      async listPermissions() {
        grantLoads++;
        return ['patient.read', 'patient.create', 'patient.update'];
      },
    },
  };

  await withServer(dependencies, async port => {
    const headers = {
      Authorization: 'Bearer ' + validAccessToken,
      'X-Workspace-ID': tenantOneId,
      'X-Permission-Revision': '"1"',
    };

    let response = await sendRequest(
      port,
      '/v1/patients',
      'POST',
      headers,
    );

    assert.equal(response.statusCode, 503);
    assert.equal(
      (response.body as { error: { code: string } }).error.code,
      'FEATURE_UNAVAILABLE',
    );

    response = await sendRequest(
      port,
      '/v1/patients/' + tenantOneId,
      'PATCH',
      headers,
    );

    assert.equal(response.statusCode, 503);
    assert.equal(
      (response.body as { error: { code: string } }).error.code,
      'FEATURE_UNAVAILABLE',
    );

    const beforeDelete = grantLoads;

    assert.equal(
      (
        await sendRequest(
          port,
          '/v1/patients',
          'DELETE',
          headers,
        )
      ).statusCode,
      405,
    );

    assert.equal(
      (
        await sendRequest(
          port,
          '/v1/patients/' + tenantOneId,
          'DELETE',
          headers,
        )
      ).statusCode,
      405,
    );

    assert.equal(
      grantLoads,
      beforeDelete,
      'unsupported DELETE must fail before permission loading',
    );
  });
});
