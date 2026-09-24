import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  IdentityContextStore,
  IdentitySubjectReference,
  Membership,
  UserIdentity,
} from '../../../libs/identity/application-entrypoint/src/index.ts';

import {
  authenticateBearerIdentity,
  authenticateBearerRequestContext,
  parseBearerAuthorizationHeader,
} from './auth-composition.ts';

const userId =
  '00000000-0000-0000-0000-000000000701';

const sessionId =
  '00000000-0000-0000-0000-000000000702';

const subject: IdentitySubjectReference = {
  issuer: 'https://issuer.example.test',
  subject: 'oidc-user-701',
};

const user: UserIdentity = {
  id: userId,
  status: 'ACTIVE',
  subject,
};

const membershipOne: Membership = {
  id: '00000000-0000-0000-0000-000000000711',
  userId,
  tenantId:
    '00000000-0000-0000-0000-000000000721',
  role: 'CLINICIAN',
  status: 'ACTIVE',
  permissionRevision: '"1"',
};

const membershipTwo: Membership = {
  id: '00000000-0000-0000-0000-000000000712',
  userId,
  tenantId:
    '00000000-0000-0000-0000-000000000722',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissionRevision: '"1"',
};

const accessToken =
  `viora_access_v1.${sessionId}.${'a'.repeat(43)}`;

function identityStore(
  memberships: readonly Membership[],
  resolvedUser: UserIdentity | null = user,
): IdentityContextStore {
  return {
    async findUserBySubject(
      requestedSubject,
    ) {
      if (
        requestedSubject.issuer !==
          subject.issuer ||
        requestedSubject.subject !==
          subject.subject
      ) {
        return null;
      }

      return resolvedUser;
    },

    async findMembershipsByUser(
      requestedUserId,
    ) {
      return requestedUserId === userId
        ? memberships
        : [];
    },
  };
}

function validSessions() {
  return {
    async authenticateAccessToken() {
      return {
        kind: 'AUTHENTICATED' as const,
        sessionId,
        userId,
        subject,
        accessExpiresAt:
          '2026-09-19T01:10:00.000Z',
        expiresAt:
          '2026-09-19T13:00:00.000Z',
      };
    },
  };
}

test(
  'parses exactly one strict Bearer credential',
  () => {
    assert.equal(
      parseBearerAuthorizationHeader(
        `Bearer ${accessToken}`,
      ),
      accessToken,
    );

    assert.equal(
      parseBearerAuthorizationHeader(
        `bearer ${accessToken}`,
      ),
      accessToken,
    );

    assert.equal(
      parseBearerAuthorizationHeader(undefined),
      null,
    );

    assert.equal(
      parseBearerAuthorizationHeader([
        `Bearer ${accessToken}`,
      ]),
      null,
    );

    assert.equal(
      parseBearerAuthorizationHeader(
        ` Bearer ${accessToken}`,
      ),
      null,
    );

    assert.equal(
      parseBearerAuthorizationHeader(
        `Bearer  ${accessToken}`,
      ),
      null,
    );

    assert.equal(
      parseBearerAuthorizationHeader(
        `Bearer ${accessToken},other`,
      ),
      null,
    );
  },
);

test(
  'rejects a malformed Authorization header before session lookup',
  async () => {
    let calls = 0;

    const result =
      await authenticateBearerIdentity(
        {
          sessions: {
            async authenticateAccessToken() {
              calls += 1;
              return { kind: 'INVALID' as const };
            },
          },
          identities:
            identityStore([membershipOne]),
        },
        {
          authorizationHeader:
            'Basic abc',
        },
      );

    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 401);
    assert.deepEqual(
      result.body,
      { code: 'UNAUTHENTICATED' },
    );
    assert.equal(calls, 0);
  },
);

test(
  'rejects an invalid or expired access session',
  async () => {
    const result =
      await authenticateBearerIdentity(
        {
          sessions: {
            async authenticateAccessToken() {
              return {
                kind: 'INVALID' as const,
              };
            },
          },
          identities:
            identityStore([membershipOne]),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
        },
      );

    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 401);
    assert.deepEqual(
      result.body,
      { code: 'UNAUTHENTICATED' },
    );
  },
);

test(
  'fails closed when the session user does not match the bound identity',
  async () => {
    const mismatchedUser: UserIdentity = {
      ...user,
      id:
        '00000000-0000-0000-0000-000000000799',
    };

    const result =
      await authenticateBearerIdentity(
        {
          sessions: validSessions(),
          identities:
            identityStore(
              [membershipOne],
              mismatchedUser,
            ),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
        },
      );

    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 401);
    assert.deepEqual(
      result.body,
      { code: 'INVALID_IDENTITY' },
    );
  },
);

test(
  'fails closed when the bound user is no longer active',
  async () => {
    const suspendedUser: UserIdentity = {
      ...user,
      status: 'SUSPENDED',
    };

    const result =
      await authenticateBearerIdentity(
        {
          sessions: validSessions(),
          identities:
            identityStore(
              [membershipOne],
              suspendedUser,
            ),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
        },
      );

    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 401);
    assert.deepEqual(
      result.body,
      { code: 'INVALID_IDENTITY' },
    );
  },
);

test(
  'creates an authenticated RequestContext for one active membership',
  async () => {
    const result =
      await authenticateBearerRequestContext(
        {
          sessions: validSessions(),
          identities:
            identityStore([membershipOne]),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
          requestId: 'request-701',
          correlationId:
            'correlation-701',
        },
      );

    assert.equal(
      result.kind,
      'AUTHENTICATED',
    );

    if (result.kind !== 'AUTHENTICATED') {
      throw new Error(
        'expected authenticated result',
      );
    }

    assert.equal(
      result.identity.subject.issuer,
      subject.issuer,
    );

    assert.deepEqual(result.context, {
      requestId: 'request-701',
      correlationId:
        'correlation-701',
      actor: {
        userId,
        subject: subject.subject,
        kind: 'HUMAN',
      },
      tenant: {
        tenantId:
          membershipOne.tenantId,
        membershipId:
          membershipOne.id,
        permissionRevision:
          membershipOne.permissionRevision,
        roles: [membershipOne.role],
      },
    });
  },
);

test(
  'requires explicit workspace selection when multiple memberships are active',
  async () => {
    const result =
      await authenticateBearerRequestContext(
        {
          sessions: validSessions(),
          identities:
            identityStore([
              membershipOne,
              membershipTwo,
            ]),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
          requestId: 'request-702',
          correlationId:
            'correlation-702',
        },
      );

    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 409);
    assert.deepEqual(
      result.body,
      {
        code:
          'TENANT_CONTEXT_REQUIRED',
      },
    );
  },
);

test(
  'rejects a workspace without an active membership',
  async () => {
    const result =
      await authenticateBearerRequestContext(
        {
          sessions: validSessions(),
          identities:
            identityStore([membershipOne]),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
          requestId: 'request-703',
          correlationId:
            'correlation-703',
          requestedTenantId:
            '00000000-0000-0000-0000-000000000799',
        },
      );

    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 403);
    assert.deepEqual(
      result.body,
      { code: 'MEMBERSHIP_REQUIRED' },
    );
  },
);

test(
  'selects the requested active workspace when multiple memberships exist',
  async () => {
    const result =
      await authenticateBearerRequestContext(
        {
          sessions: validSessions(),
          identities:
            identityStore([
              membershipOne,
              membershipTwo,
            ]),
        },
        {
          authorizationHeader:
            `Bearer ${accessToken}`,
          requestId: 'request-704',
          correlationId:
            'correlation-704',
          requestedTenantId:
            membershipTwo.tenantId,
        },
      );

    assert.equal(
      result.kind,
      'AUTHENTICATED',
    );

    if (result.kind !== 'AUTHENTICATED') {
      throw new Error(
        'expected authenticated result',
      );
    }

    assert.equal(
      result.context.tenant?.tenantId,
      membershipTwo.tenantId,
    );

    assert.equal(
      result.context.tenant?.membershipId,
      membershipTwo.id,
    );

    assert.equal(
      result.context.tenant?.permissionRevision,
      membershipTwo.permissionRevision,
    );
  },
);
