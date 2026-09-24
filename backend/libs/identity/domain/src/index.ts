import type {
  IdentitySubjectReference,
  Membership,
  UserIdentity,
} from '../../contracts/src/index.ts';

export class IdentityInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'IdentityInvariantError';
  }
}

export type { IdentityContextStore } from './identity-context-store.ts';
export type { MembershipGrantStore } from './membership-grant-store.ts';

export type {
  AuthTransaction,
  AuthTransactionRepository,
  AuthTransactionStatus,
  ClaimAuthTransactionInput,
  CompleteAuthTransactionInput,
  CreateAuthTransactionInput,
} from './auth-transaction.ts';

export function assertValidSubject(subject: IdentitySubjectReference): void {
  if (!subject.issuer.trim() || !subject.subject.trim()) {
    throw new IdentityInvariantError('Identity subject is invalid');
  }
}

export function assertActiveUser(user: UserIdentity): void {
  if (user.status !== 'ACTIVE') {
    throw new IdentityInvariantError('User identity is not active');
  }
}

export function assertActiveMembership(
  membership: Membership,
  userId: string,
  tenantId?: string,
): void {
  if (
    membership.status !== 'ACTIVE' ||
    membership.userId !== userId ||
    (tenantId !== undefined && membership.tenantId !== tenantId)
  ) {
    throw new IdentityInvariantError('Membership is invalid for context');
  }
}

export type {
  AccessSessionLookup,
  AccessSessionLookupInput,
  CreateSessionInput,
  RefreshRotationResult,
  RefreshSessionLookup,
  RefreshSessionLookupInput,
  RevokeSessionInput,
  RotateRefreshTokenInput,
  SessionRepository,
} from './session-repository.ts';
