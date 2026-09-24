import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AccessSessionLookup,
  AccessSessionLookupInput,
  CreateSessionInput,
  RefreshRotationResult,
  RefreshSessionLookup,
  RefreshSessionLookupInput,
  RevokeSessionInput,
  RotateRefreshTokenInput,
  SessionRepository,
} from '../../domain/src/session-repository.ts';

import {
  SessionService,
} from './session-service.ts';

import {
  accessTokenSessionId,
  createAccessToken,
  createRefreshToken,
  hashSessionToken,
  refreshTokenId,
} from './session-tokens.ts';

class RecordingSessionRepository
  implements SessionRepository {
  public created:
    CreateSessionInput | null = null;

  public accessLookupInput:
    AccessSessionLookupInput | null = null;

  public accessLookup:
    AccessSessionLookup | null = null;

  public refreshLookupInput:
    RefreshSessionLookupInput | null = null;

  public rotationInput:
    RotateRefreshTokenInput | null = null;

  public lookup:
    RefreshSessionLookup | null = null;

  public rotationResult:
    RefreshRotationResult = {
      kind: 'INVALID',
    };

  public revokeInput:
    RevokeSessionInput | null = null;

  public revokeResult = false;

  public async create(
    input: CreateSessionInput,
  ): Promise<void> {
    this.created = input;
  }

  public async findActiveAccessSession(
    input: AccessSessionLookupInput,
  ): Promise<AccessSessionLookup | null> {
    this.accessLookupInput = input;
    return this.accessLookup;
  }

  public async findRefreshSession(
    input: RefreshSessionLookupInput,
  ): Promise<RefreshSessionLookup | null> {
    this.refreshLookupInput = input;
    return this.lookup;
  }

  public async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshRotationResult> {
    this.rotationInput = input;
    return this.rotationResult;
  }

  public async revokeSession(
    input: RevokeSessionInput,
  ): Promise<boolean> {
    this.revokeInput = input;
    return this.revokeResult;
  }
}

test(
  'creates a session with short access lifetime and fixed refresh lifetime',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const now =
      new Date(
        '2026-09-19T00:00:00.000Z',
      );

    const result =
      await service.createSession({
        userId:
          '00000000-0000-0000-0000-000000000501',
        subject: {
          issuer:
            'https://issuer.example.test',
          subject:
            'identity-user-501',
        },
        now,
      });

    assert.ok(repository.created);

    assert.equal(
      repository.created.userId,
      '00000000-0000-0000-0000-000000000501',
    );

    assert.equal(
      repository.created.identityIssuer,
      'https://issuer.example.test',
    );

    assert.equal(
      repository.created.identitySubject,
      'identity-user-501',
    );

    assert.equal(
      repository.created.createdAt,
      '2026-09-19T00:00:00.000Z',
    );

    assert.equal(
      repository.created.accessExpiresAt,
      '2026-09-19T00:10:00.000Z',
    );

    assert.equal(
      repository.created.expiresAt,
      '2026-09-19T12:00:00.000Z',
    );

    assert.equal(
      result.accessExpiresAt,
      '2026-09-19T00:10:00.000Z',
    );

    assert.equal(
      result.refreshExpiresAt,
      '2026-09-19T12:00:00.000Z',
    );

    assert.match(
      result.accessToken,
      /^viora_access_v1\./,
    );

    assert.match(
      result.refreshToken,
      /^viora_refresh_v1\./,
    );

    assert.match(
      repository.created.accessTokenHash,
      /^[0-9a-f]{64}$/,
    );

    assert.match(
      repository.created.refreshTokenHash,
      /^[0-9a-f]{64}$/,
    );

    assert.notEqual(
      repository.created.accessTokenHash,
      result.accessToken,
    );

    assert.notEqual(
      repository.created.refreshTokenHash,
      result.refreshToken,
    );
  },
);

test(
  'authenticates a valid access token using only its SHA-256 hash',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const sessionId =
      '00000000-0000-0000-0000-000000000901';

    const userId =
      '00000000-0000-0000-0000-000000000902';

    const accessToken =
      createAccessToken(sessionId);

    repository.accessLookup = {
      sessionId,
      userId,
      identityIssuer:
        'https://issuer.example.test',
      identitySubject:
        'identity-user-902',
      accessExpiresAt:
        '2026-09-19T00:10:00.000Z',
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    };

    const result =
      await service.authenticateAccessToken({
        accessToken,
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(
      repository.accessLookupInput,
      {
        sessionId,
        presentedAccessTokenHash:
          hashSessionToken(accessToken),
        now:
          '2026-09-19T00:05:00.000Z',
      },
    );

    assert.equal(
      repository.accessLookupInput?.presentedAccessTokenHash ===
        accessToken,
      false,
    );

    assert.deepEqual(result, {
      kind: 'AUTHENTICATED',
      sessionId,
      userId,
      subject: {
        issuer:
          'https://issuer.example.test',
        subject:
          'identity-user-902',
      },
      accessExpiresAt:
        '2026-09-19T00:10:00.000Z',
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    });
  },
);

test(
  'rejects a malformed access token before repository lookup',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const result =
      await service.authenticateAccessToken({
        accessToken:
          'not-an-access-token',
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'INVALID',
    });

    assert.equal(
      repository.accessLookupInput,
      null,
    );
  },
);

test(
  'returns INVALID when the access session lookup fails',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const accessToken =
      createAccessToken(
        '00000000-0000-0000-0000-000000000903',
      );

    const result =
      await service.authenticateAccessToken({
        accessToken,
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'INVALID',
    });

    assert.ok(
      repository.accessLookupInput,
    );
  },
);

test(
  'rotates a valid refresh token and returns a new token bundle',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const presentedTokenId =
      '00000000-0000-0000-0000-000000000601';

    const sessionId =
      '00000000-0000-0000-0000-000000000602';

    const userId =
      '00000000-0000-0000-0000-000000000603';

    const familyId =
      '00000000-0000-0000-0000-000000000604';

    const presentedRefreshToken =
      createRefreshToken(
        presentedTokenId,
      );

    repository.lookup = {
      sessionId,
      userId,
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    };

    repository.rotationResult = {
      kind: 'ROTATED',
      sessionId,
      userId,
      familyId,
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    };

    const result =
      await service.refreshSession({
        refreshToken:
          presentedRefreshToken,
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.equal(
      result.kind,
      'ROTATED',
    );

    if (result.kind !== 'ROTATED') {
      assert.fail('expected ROTATED');
    }

    assert.deepEqual(
      repository.refreshLookupInput,
      {
        tokenId: presentedTokenId,
        presentedTokenHash:
          hashSessionToken(
            presentedRefreshToken,
          ),
      },
    );

    assert.ok(repository.rotationInput);

    assert.equal(
      repository.rotationInput.tokenId,
      presentedTokenId,
    );

    assert.equal(
      repository.rotationInput.rotatedAt,
      '2026-09-19T00:05:00.000Z',
    );

    assert.equal(
      repository.rotationInput.nextAccessExpiresAt,
      '2026-09-19T00:15:00.000Z',
    );

    assert.equal(
      Object.hasOwn(
        repository.rotationInput,
        'nextTokenExpiresAt',
      ),
      false,
    );

    assert.equal(
      accessTokenSessionId(
        result.tokens.accessToken,
      ),
      sessionId,
    );

    assert.equal(
      refreshTokenId(
        result.tokens.refreshToken,
      ),
      repository.rotationInput.nextTokenId,
    );

    assert.equal(
      result.tokens.accessExpiresAt,
      '2026-09-19T00:15:00.000Z',
    );

    assert.equal(
      result.tokens.refreshExpiresAt,
      '2026-09-19T12:00:00.000Z',
    );

    assert.match(
      repository.rotationInput.nextAccessTokenHash,
      /^[0-9a-f]{64}$/,
    );

    assert.match(
      repository.rotationInput.nextTokenHash,
      /^[0-9a-f]{64}$/,
    );

    assert.notEqual(
      repository.rotationInput.nextAccessTokenHash,
      result.tokens.accessToken,
    );

    assert.notEqual(
      repository.rotationInput.nextTokenHash,
      result.tokens.refreshToken,
    );
  },
);

test(
  'rejects a malformed refresh token before repository lookup',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const result =
      await service.refreshSession({
        refreshToken:
          'not-a-refresh-token',
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'INVALID',
    });

    assert.equal(
      repository.refreshLookupInput,
      null,
    );

    assert.equal(
      repository.rotationInput,
      null,
    );
  },
);

test(
  'propagates refresh-token replay detection',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const tokenId =
      '00000000-0000-0000-0000-000000000701';

    const sessionId =
      '00000000-0000-0000-0000-000000000702';

    const userId =
      '00000000-0000-0000-0000-000000000703';

    const familyId =
      '00000000-0000-0000-0000-000000000704';

    const refreshToken =
      createRefreshToken(tokenId);

    repository.lookup = {
      sessionId,
      userId,
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    };

    repository.rotationResult = {
      kind: 'REPLAY_DETECTED',
      sessionId,
      userId,
      familyId,
    };

    const result =
      await service.refreshSession({
        refreshToken,
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'REPLAY_DETECTED',
    });
  },
);

test(
  'caps access expiry at the fixed session expiry',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const tokenId =
      '00000000-0000-0000-0000-000000000801';

    const sessionId =
      '00000000-0000-0000-0000-000000000802';

    const userId =
      '00000000-0000-0000-0000-000000000803';

    const familyId =
      '00000000-0000-0000-0000-000000000804';

    const refreshToken =
      createRefreshToken(tokenId);

    repository.lookup = {
      sessionId,
      userId,
      expiresAt:
        '2026-09-19T00:07:00.000Z',
    };

    repository.rotationResult = {
      kind: 'ROTATED',
      sessionId,
      userId,
      familyId,
      expiresAt:
        '2026-09-19T00:07:00.000Z',
    };

    const result =
      await service.refreshSession({
        refreshToken,
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.equal(
      result.kind,
      'ROTATED',
    );

    if (result.kind !== 'ROTATED') {
      assert.fail('expected ROTATED');
    }

    assert.equal(
      repository.rotationInput?.nextAccessExpiresAt,
      '2026-09-19T00:07:00.000Z',
    );

    assert.equal(
      result.tokens.accessExpiresAt,
      '2026-09-19T00:07:00.000Z',
    );

    assert.equal(
      result.tokens.refreshExpiresAt,
      '2026-09-19T00:07:00.000Z',
    );
  },
);

test(
  'revokes a valid access session',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const sessionId =
      '00000000-0000-0000-0000-000000001001';

    const userId =
      '00000000-0000-0000-0000-000000001002';

    const accessToken =
      createAccessToken(sessionId);

    repository.accessLookup = {
      sessionId,
      userId,
      identityIssuer:
        'https://issuer.example.test',
      identitySubject:
        'identity-user-1002',
      accessExpiresAt:
        '2026-09-19T00:10:00.000Z',
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    };
    repository.revokeResult = true;

    const result =
      await service.revokeAccessSession({
        accessToken,
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'REVOKED',
    });
    assert.deepEqual(repository.revokeInput, {
      sessionId,
      userId,
      revokedAt:
        '2026-09-19T00:05:00.000Z',
    });
  },
);

test(
  'rejects a malformed access token before lookup during revoke',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const result =
      await service.revokeAccessSession({
        accessToken: 'not-an-access-token',
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'INVALID',
    });
    assert.equal(repository.accessLookupInput, null);
    assert.equal(repository.revokeInput, null);
  },
);

test(
  'returns INVALID when the active access session lookup fails during revoke',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const result =
      await service.revokeAccessSession({
        accessToken: createAccessToken(
          '00000000-0000-0000-0000-000000001003',
        ),
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'INVALID',
    });
    assert.equal(repository.revokeInput, null);
  },
);

test(
  'returns INVALID when repository revoke returns false',
  async () => {
    const repository =
      new RecordingSessionRepository();

    const service =
      new SessionService({
        sessions: repository,
      });

    const sessionId =
      '00000000-0000-0000-0000-000000001004';

    repository.accessLookup = {
      sessionId,
      userId:
        '00000000-0000-0000-0000-000000001005',
      identityIssuer:
        'https://issuer.example.test',
      identitySubject:
        'identity-user-1005',
      accessExpiresAt:
        '2026-09-19T00:10:00.000Z',
      expiresAt:
        '2026-09-19T12:00:00.000Z',
    };

    const result =
      await service.revokeAccessSession({
        accessToken: createAccessToken(sessionId),
        now: new Date(
          '2026-09-19T00:05:00.000Z',
        ),
      });

    assert.deepEqual(result, {
      kind: 'INVALID',
    });
    assert.deepEqual(repository.revokeInput, {
      sessionId,
      userId:
        '00000000-0000-0000-0000-000000001005',
      revokedAt:
        '2026-09-19T00:05:00.000Z',
    });
  },
);
