import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  IdentityContextStore,
  Membership,
  UserIdentity,
} from '../../../libs/identity/application-entrypoint/src/index.ts';
import type { HttpAuthDependencies } from './auth-composition.ts';
import {
  handleAuthenticatedGetMe,
  handleAuthenticatedListMyMemberships,
  handleGetMe,
  handleListMyMemberships,
} from './identity-api.ts';

const subject = { issuer: 'https://issuer.example', subject: 'user-123' };
const user: UserIdentity = {
  id: '00000000-0000-0000-0000-000000000801',
  status: 'ACTIVE',
  subject,
};
const activeMembership: Membership = {
  id: 'membership-a',
  userId: user.id,
  tenantId: 'tenant-a',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissionRevision: '"1"',
};
const suspendedMembership: Membership = {
  ...activeMembership,
  id: 'membership-suspended',
  tenantId: 'tenant-b',
  status: 'SUSPENDED',
};

function store(memberships: readonly Membership[]): IdentityContextStore {
  return {
    async findUserBySubject() {
      return user;
    },
    async findMembershipsByUser() {
      return memberships;
    },
  };
}

const sessionId = '00000000-0000-0000-0000-000000000802';
const accessToken = `viora_access_v1.${sessionId}.${'a'.repeat(43)}`;

function authenticatedDependencies(
  memberships: readonly Membership[],
): HttpAuthDependencies {
  return {
    identities: store(memberships),
    sessions: {
      async authenticateAccessToken() {
        return {
          kind: 'AUTHENTICATED' as const,
          sessionId,
          userId: user.id,
          subject,
          accessExpiresAt: '2026-09-19T02:10:00.000Z',
          expiresAt: '2026-09-19T13:00:00.000Z',
        };
      },
    },
  };
}

test('GET /me returns only the authenticated tenant context', async () => {
  const response = await handleGetMe(store([activeMembership]), subject, 'tenant-a');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    actor: { userId: user.id, subject, status: 'ACTIVE' },
    membership: activeMembership,
    tenant: { tenantId: 'tenant-a', membershipId: 'membership-a' },
  });
});

test('GET /me fails closed when tenant context is ambiguous', async () => {
  const secondMembership = { ...activeMembership, id: 'membership-b', tenantId: 'tenant-b' };
  const response = await handleGetMe(store([activeMembership, secondMembership]), subject);

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { code: 'TENANT_CONTEXT_REQUIRED' });
});

test('GET /me/memberships returns only active memberships', async () => {
  const response = await handleListMyMemberships(
    store([activeMembership, suspendedMembership]),
    subject,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [activeMembership]);
});

test('identity endpoints reject a missing subject', async () => {
  const storeWithNoLookup: IdentityContextStore = {
    async findUserBySubject() {
      throw new Error('must not access identity store');
    },
    async findMembershipsByUser() {
      throw new Error('must not access membership store');
    },
  };

  const me = await handleGetMe(storeWithNoLookup, null, 'tenant-a');
  const memberships = await handleListMyMemberships(storeWithNoLookup, null);

  assert.equal(me.status, 401);
  assert.equal(memberships.status, 401);
});

test('authenticated GET /me accepts a valid bearer session', async () => {
  const response = await handleAuthenticatedGetMe(
    authenticatedDependencies([activeMembership]),
    {
      authorizationHeader: `Bearer ${accessToken}`,
      requestId: 'request-801',
      correlationId: 'correlation-801',
      requestedTenantId: activeMembership.tenantId,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    actor: { userId: user.id, subject, status: 'ACTIVE' },
    membership: activeMembership,
    tenant: {
      tenantId: activeMembership.tenantId,
      membershipId: activeMembership.id,
    },
  });
});

test('authenticated GET /me rejects a missing bearer credential', async () => {
  let calls = 0;
  const dependencies: HttpAuthDependencies = {
    identities: store([activeMembership]),
    sessions: {
      async authenticateAccessToken() {
        calls += 1;
        return { kind: 'INVALID' as const };
      },
    },
  };

  const response = await handleAuthenticatedGetMe(
    dependencies,
    {
      authorizationHeader: undefined,
      requestId: 'request-802',
      correlationId: 'correlation-802',
    },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { code: 'UNAUTHENTICATED' });
  assert.equal(calls, 0);
});

test('authenticated GET /me requires workspace selection when memberships are ambiguous', async () => {
  const secondMembership = {
    ...activeMembership,
    id: 'membership-b',
    tenantId: 'tenant-b',
  };
  const response = await handleAuthenticatedGetMe(
    authenticatedDependencies([activeMembership, secondMembership]),
    {
      authorizationHeader: `Bearer ${accessToken}`,
      requestId: 'request-803',
      correlationId: 'correlation-803',
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { code: 'TENANT_CONTEXT_REQUIRED' });
});

test('authenticated GET /me/memberships does not require a workspace', async () => {
  const response = await handleAuthenticatedListMyMemberships(
    authenticatedDependencies([activeMembership, suspendedMembership]),
    {
      authorizationHeader: `Bearer ${accessToken}`,
      requestId: 'request-804',
      correlationId: 'correlation-804',
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [activeMembership]);
});

test('authenticated GET /me/memberships rejects an invalid access session', async () => {
  const dependencies: HttpAuthDependencies = {
    identities: store([activeMembership]),
    sessions: {
      async authenticateAccessToken() {
        return { kind: 'INVALID' as const };
      },
    },
  };

  const response = await handleAuthenticatedListMyMemberships(
    dependencies,
    {
      authorizationHeader: `Bearer ${accessToken}`,
      requestId: 'request-805',
      correlationId: 'correlation-805',
    },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { code: 'UNAUTHENTICATED' });
});
