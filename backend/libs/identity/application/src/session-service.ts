import { randomUUID } from 'node:crypto';

import type {
  SessionRepository,
} from '../../domain/src/session-repository.ts';

import type {
  IdentitySubjectReference,
} from '../../contracts/src/index.ts';

import {
  accessTokenSessionId,
  createAccessToken,
  createRefreshToken,
  hashSessionToken,
  refreshTokenId,
} from './session-tokens.ts';

const ACCESS_TTL_MS = 10 * 60 * 1000;
const REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionTokenBundle {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt: string;
}

export interface CreateSessionRequest {
  readonly userId: string;
  readonly subject: IdentitySubjectReference;
  readonly now?: Date;
}

export interface RefreshSessionRequest {
  readonly refreshToken: string;
  readonly now?: Date;
}

export type RefreshSessionResult =
  | {
      readonly kind: 'ROTATED';
      readonly tokens: SessionTokenBundle;
    }
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'REVOKED' }
  | { readonly kind: 'EXPIRED' }
  | { readonly kind: 'REPLAY_DETECTED' };

export interface AuthenticateAccessTokenRequest {
  readonly accessToken: string;
  readonly now?: Date;
}

export type AuthenticateAccessTokenResult =
  | {
      readonly kind: 'AUTHENTICATED';
      readonly sessionId: string;
      readonly userId: string;
      readonly subject: IdentitySubjectReference;
      readonly accessExpiresAt: string;
      readonly expiresAt: string;
    }
  | {
      readonly kind: 'INVALID';
    };

export interface RevokeAccessSessionRequest {
  readonly accessToken: string;
  readonly now?: Date;
}

export type RevokeAccessSessionResult =
  | { readonly kind: 'REVOKED' }
  | { readonly kind: 'INVALID' };

export interface SessionServiceDependencies {
  readonly sessions: SessionRepository;
}

function validInstant(
  value: Date,
  field: string,
): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${field} is invalid`);
  }

  return value;
}

function addMilliseconds(
  value: Date,
  milliseconds: number,
): Date {
  return new Date(
    value.getTime() + milliseconds,
  );
}

export class SessionService {
  private readonly sessions: SessionRepository;

  public constructor(
    dependencies: SessionServiceDependencies,
  ) {
    this.sessions = dependencies.sessions;
  }

  public async createSession(
    request: CreateSessionRequest,
  ): Promise<SessionTokenBundle> {
    const now = validInstant(
      request.now ?? new Date(),
      'Session creation time',
    );

    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshTokenIdValue = randomUUID();

    const accessToken =
      createAccessToken(sessionId);

    const refreshToken =
      createRefreshToken(
        refreshTokenIdValue,
      );

    const accessExpiresAt =
      addMilliseconds(
        now,
        ACCESS_TTL_MS,
      ).toISOString();

    const refreshExpiresAt =
      addMilliseconds(
        now,
        REFRESH_TTL_MS,
      ).toISOString();

    await this.sessions.create({
      sessionId,
      userId: request.userId,
      identityIssuer: request.subject.issuer,
      identitySubject: request.subject.subject,
      accessTokenHash:
        hashSessionToken(accessToken),
      accessExpiresAt,
      familyId,
      refreshTokenId:
        refreshTokenIdValue,
      refreshTokenHash:
        hashSessionToken(refreshToken),
      createdAt: now.toISOString(),
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
    };
  }

  public async authenticateAccessToken(
    request: AuthenticateAccessTokenRequest,
  ): Promise<AuthenticateAccessTokenResult> {
    const now = validInstant(
      request.now ?? new Date(),
      'Access-token authentication time',
    );

    const sessionId =
      accessTokenSessionId(
        request.accessToken,
      );

    if (!sessionId) {
      return {
        kind: 'INVALID',
      };
    }

    const session =
      await this.sessions.findActiveAccessSession({
        sessionId,
        presentedAccessTokenHash:
          hashSessionToken(
            request.accessToken,
          ),
        now: now.toISOString(),
      });

    if (!session) {
      return {
        kind: 'INVALID',
      };
    }

    if (session.sessionId !== sessionId) {
      throw new Error(
        'Access-token lookup returned inconsistent session state',
      );
    }

    return {
      kind: 'AUTHENTICATED',
      sessionId: session.sessionId,
      userId: session.userId,
      subject: {
        issuer: session.identityIssuer,
        subject: session.identitySubject,
      },
      accessExpiresAt:
        session.accessExpiresAt,
      expiresAt:
        session.expiresAt,
    };
  }

  public async refreshSession(
    request: RefreshSessionRequest,
  ): Promise<RefreshSessionResult> {
    const now = validInstant(
      request.now ?? new Date(),
      'Session refresh time',
    );

    const presentedTokenId =
      refreshTokenId(
        request.refreshToken,
      );

    if (!presentedTokenId) {
      return {
        kind: 'INVALID',
      };
    }

    const presentedTokenHash =
      hashSessionToken(
        request.refreshToken,
      );

    const lookup =
      await this.sessions.findRefreshSession({
        tokenId: presentedTokenId,
        presentedTokenHash,
      });

    if (!lookup) {
      return {
        kind: 'INVALID',
      };
    }

    const sessionExpiresAt =
      validInstant(
        new Date(lookup.expiresAt),
        'Session expiry',
      );

    const normalAccessExpiry =
      addMilliseconds(
        now,
        ACCESS_TTL_MS,
      );

    const nextAccessExpiresAt =
      new Date(
        Math.min(
          normalAccessExpiry.getTime(),
          sessionExpiresAt.getTime(),
        ),
      ).toISOString();

    const nextTokenId = randomUUID();

    const accessToken =
      createAccessToken(
        lookup.sessionId,
      );

    const refreshToken =
      createRefreshToken(
        nextTokenId,
      );

    const rotation =
      await this.sessions.rotateRefreshToken({
        tokenId: presentedTokenId,
        presentedTokenHash,
        nextTokenId,
        nextTokenHash:
          hashSessionToken(refreshToken),
        nextAccessTokenHash:
          hashSessionToken(accessToken),
        nextAccessExpiresAt,
        rotatedAt: now.toISOString(),
      });

    if (rotation.kind !== 'ROTATED') {
      return {
        kind: rotation.kind,
      };
    }

    if (
      rotation.sessionId !==
        lookup.sessionId ||
      rotation.userId !==
        lookup.userId ||
      new Date(
        rotation.expiresAt,
      ).getTime() !==
        sessionExpiresAt.getTime()
    ) {
      throw new Error(
        'Refresh rotation returned inconsistent session state',
      );
    }

    return {
      kind: 'ROTATED',
      tokens: {
        accessToken,
        refreshToken,
        accessExpiresAt:
          nextAccessExpiresAt,
        refreshExpiresAt:
          rotation.expiresAt,
      },
    };
  }

  public async revokeAccessSession(
    request: RevokeAccessSessionRequest,
  ): Promise<RevokeAccessSessionResult> {
    const sessionId =
      accessTokenSessionId(
        request.accessToken,
      );

    if (!sessionId) {
      return {
        kind: 'INVALID',
      };
    }

    const now = validInstant(
      request.now ?? new Date(),
      'Session revocation time',
    );

    const session =
      await this.sessions.findActiveAccessSession({
        sessionId,
        presentedAccessTokenHash:
          hashSessionToken(
            request.accessToken,
          ),
        now: now.toISOString(),
      });

    if (!session) {
      return {
        kind: 'INVALID',
      };
    }

    if (session.sessionId !== sessionId) {
      throw new Error(
        'Access-token lookup returned inconsistent session state',
      );
    }

    const revoked =
      await this.sessions.revokeSession({
        sessionId: session.sessionId,
        userId: session.userId,
        revokedAt: now.toISOString(),
      });

    if (!revoked) {
      return {
        kind: 'INVALID',
      };
    }

    return {
      kind: 'REVOKED',
    };
  }
}
