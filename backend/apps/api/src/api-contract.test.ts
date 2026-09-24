import { domainRouteGates } from './domain-route-gates.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type OpenApiOperation = {
  readonly operationId?: string;
  readonly 'x-phase4b-status'?: string;
  readonly security?: readonly Record<string, readonly unknown[]>[];
  readonly parameters?: readonly { readonly $ref: string }[];
  readonly responses: Record<string, unknown>;
};

type OpenApiPath = {
  readonly get?: OpenApiOperation;
  readonly post?: OpenApiOperation;
};

type OpenApiContract = {
  readonly paths: Record<string, OpenApiPath>;
  readonly 'x-api-base': string;
  readonly 'x-wire-format': string;
  readonly 'x-response-headers': Record<string, string>;
  readonly components: {
    readonly securitySchemes: Record<string, {
      readonly type: string;
      readonly scheme?: string;
      readonly bearerFormat?: string;
    }>;
    readonly parameters: Record<string, {
      readonly name: string;
      readonly in?: string;
      readonly required?: boolean;
      readonly schema?: {
        readonly type?: string;
        readonly format?: string;
      };
    }>;
  };
};

test('Phase 4B executable API contract is versioned under /v1 with one wire convention', async () => {
  const contract = JSON.parse(await readFile(new URL('../../../docs/api/openapi.json', import.meta.url), 'utf8')) as OpenApiContract;
  assert.equal(contract['x-api-base'], '/v1');
  assert.match(contract['x-wire-format'], /camelCase/);
  assert.ok(Object.keys(contract.paths).every((path) => path.startsWith('/v1/')));
  assert.equal(Object.keys(contract.paths).some((path) => path.startsWith('/api/v1/')), false);
  assert.equal(contract.components.parameters.WorkspaceId.name, 'X-Workspace-ID');
  assert.equal(contract.components.parameters.PermissionRevision.name, 'X-Permission-Revision');
  assert.equal(contract.components.parameters.IdempotencyKey.name, 'Idempotency-Key');
  assert.equal(contract.components.parameters.OperationCreatedAt.name, 'X-Operation-Created-At');
  assert.equal(contract.components.parameters.IfMatch.name, 'If-Match');
  assert.equal(contract.components.parameters.AssuranceToken.name, 'X-Assurance-Token');
  assert.equal(contract['x-response-headers'].ETag.startsWith('strong'), true);

  const bearerAuth = contract.components.securitySchemes.bearerAuth;
  assert.equal(bearerAuth.type, 'http');
  assert.equal(bearerAuth.scheme, 'bearer');
  assert.equal(bearerAuth.bearerFormat, 'opaque');

  const workspaceId = contract.components.parameters.WorkspaceId;
  assert.equal(workspaceId.name, 'X-Workspace-ID');
  assert.equal(workspaceId.required, true);

  const workspaceIdOptional = contract.components.parameters.WorkspaceIdOptional;
  assert.equal(workspaceIdOptional.name, 'X-Workspace-ID');
  assert.equal(workspaceIdOptional.in, 'header');
  assert.equal(workspaceIdOptional.required, false);
  assert.equal(workspaceIdOptional.schema?.type, 'string');
  assert.equal(workspaceIdOptional.schema?.format, 'uuid');

  const me = contract.paths['/v1/me']?.get;
  assert.ok(me);
  assert.equal(me.operationId, 'getMe');
  assert.equal(me['x-phase4b-status'], 'implemented-auth-5a');
  assert.deepEqual(me.security, [{ bearerAuth: [] }]);
  assert.deepEqual(me.parameters, [
    { $ref: '#/components/parameters/WorkspaceIdOptional' },
  ]);
  assert.ok(me.responses['200']);
  assert.ok(me.responses['401']);
  assert.ok(me.responses['403']);
  assert.ok(me.responses['409']);

  const memberships = contract.paths['/v1/me/memberships']?.get;
  assert.ok(memberships);
  assert.equal(memberships.operationId, 'listMyMemberships');
  assert.equal(memberships['x-phase4b-status'], 'implemented-auth-5a');
  assert.deepEqual(memberships.security, [{ bearerAuth: [] }]);
  assert.equal(memberships.parameters?.length ?? 0, 0);
  assert.ok(memberships.responses['200']);
  assert.ok(memberships.responses['401']);
  assert.equal('403' in memberships.responses, false);
  assert.equal('409' in memberships.responses, false);

  const refresh = contract.paths['/v1/auth/refresh']?.post;
  assert.ok(refresh);
  assert.equal(refresh.operationId, 'refreshSession');
  assert.equal(refresh['x-phase4b-status'], 'implemented-auth-5a');
  assert.equal(refresh.security, undefined);
  assert.ok(refresh.responses['200']);
  assert.ok(refresh.responses['400']);
  assert.ok(refresh.responses['401']);
  assert.ok(refresh.responses['413']);

  const revoke = contract.paths['/v1/auth/revoke']?.post;
  assert.ok(revoke);
  assert.equal(revoke.operationId, 'revokeSession');
  assert.equal(revoke['x-phase4b-status'], 'implemented-auth-5a');
  assert.deepEqual(revoke.security, [{ bearerAuth: [] }]);
  assert.ok(revoke.responses['204']);
  assert.ok(revoke.responses['401']);

  const session = contract.paths['/v1/auth/session']?.post;
  assert.ok(session);
  assert.equal(session['x-phase4b-status'], 'implemented-auth-5a');
  assert.equal(session.operationId, 'createSession');
  assert.deepEqual(session.security, []);
  for (const status of ['200', '400', '401', '403', '413', '503']) assert.ok(session.responses[status]);

  const transactions = contract.paths['/v1/auth/transactions']?.post;
  assert.ok(transactions);
  assert.equal(transactions['x-phase4b-status'], 'implemented-auth-5a');
  assert.equal(transactions.operationId, 'createAuthTransaction');
  assert.deepEqual(transactions.security, []);
  for (const status of ['201', '400', '413', '503']) assert.ok(transactions.responses[status]);
});


test('OpenAPI lists only runtime routes and domain gates never promise success', async () => {
  const contract = JSON.parse(await readFile(new URL('../../../docs/api/openapi.json', import.meta.url), 'utf8')) as OpenApiContract;
  const auth = ['/v1/auth/register','/v1/auth/login','/v1/health','/v1/me','/v1/me/memberships','/v1/me/appointments','/v1/auth/transactions','/v1/auth/session','/v1/auth/refresh','/v1/auth/revoke'];
  assert.deepEqual(Object.keys(contract.paths).sort(), [...new Set([...auth,...domainRouteGates.map(route=>route.path)])].sort());
  for(const route of domainRouteGates) {
    const operation = (contract.paths[route.path] as Record<string, OpenApiOperation>)[route.method.toLowerCase()]!;
    assert.ok(operation.responses['503']);
    assert.equal(Object.keys(operation.responses).some(status=>status.startsWith('2')), route.method === 'GET' && ['/v1/patients', '/v1/patients/{id}'].includes(route.path));
  }
});
