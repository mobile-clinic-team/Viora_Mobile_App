export interface CreateSessionInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly accessTokenHash: string;
  readonly accessExpiresAt: string;
  readonly familyId: string;
  readonly refreshTokenId: string;
  readonly refreshTokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AccessSessionLookupInput {
  readonly sessionId: string;
  readonly presentedAccessTokenHash: string;
  readonly now: string;
}

export interface AccessSessionLookup {
  readonly sessionId: string;
  readonly userId: string;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly accessExpiresAt: string;
  readonly expiresAt: string;
}

export interface AccessSessionLookupInput {
  readonly sessionId: string;
  readonly presentedAccessTokenHash: string;
  readonly now: string;
}

export interface AccessSessionLookup {
  readonly sessionId: string;
  readonly userId: string;
  readonly accessExpiresAt: string;
  readonly expiresAt: string;
}

export interface RefreshSessionLookupInput {
  readonly tokenId: string;
  readonly presentedTokenHash: string;
}

export interface RefreshSessionLookup {
  readonly sessionId: string;
  readonly userId: string;
  readonly expiresAt: string;
}

export interface RotateRefreshTokenInput {
  readonly tokenId: string;
  readonly presentedTokenHash: string;
  readonly nextTokenId: string;
  readonly nextTokenHash: string;
  readonly nextAccessTokenHash: string;
  readonly nextAccessExpiresAt: string;
  readonly rotatedAt: string;
}

export type RefreshRotationResult =
  | {
      readonly kind: 'ROTATED';
      readonly sessionId: string;
      readonly userId: string;
      readonly familyId: string;
      readonly expiresAt: string;
    }
  | {
      readonly kind: 'REPLAY_DETECTED';
      readonly sessionId: string;
      readonly userId: string;
      readonly familyId: string;
    }
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'REVOKED' }
  | { readonly kind: 'EXPIRED' };

export interface RevokeSessionInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly revokedAt: string;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;

  findActiveAccessSession(
    input: AccessSessionLookupInput,
  ): Promise<AccessSessionLookup | null>;

  findRefreshSession(
    input: RefreshSessionLookupInput,
  ): Promise<RefreshSessionLookup | null>;

  rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshRotationResult>;

  revokeSession(input: RevokeSessionInput): Promise<boolean>;
}