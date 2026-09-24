import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type {
  AuthTransactionRepository,
} from '../../domain/src/auth-transaction.ts';
import type { IdentityContextStore } from '../../domain/src/identity-context-store.ts';
import type {
  CreateSessionRequest,
  SessionTokenBundle,
} from './session-service.ts';
import type { UserIdentity } from '../../contracts/src/index.ts';
import {
  OidcProviderUnavailableError,
  OidcVerificationError,
} from './oidc-provider.ts';
import type {
  OidcProvider,
  OidcProviderRegistry,
  VerifiedOidcIdentity,
} from './oidc-provider.ts';
import type { AuthTransactionSecretProtector } from './auth-transaction-protector.ts';

const TRANSACTION_TTL_MS = 5 * 60 * 1000;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateAuthTransactionRequest {
  readonly providerKey?: string;
  readonly now?: Date;
}

export interface AuthTransactionAuthorization {
  readonly transactionId: string;
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt: string;
}

export interface CompleteAuthSessionRequest {
  readonly transactionId: string;
  readonly code: string;
  readonly state: string;
  readonly now?: Date;
}

export type AuthTransactionServiceErrorCode =
  | 'INVALID_AUTH_PROVIDER'
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'INVALID_AUTH_TRANSACTION'
  | 'AUTH_TRANSACTION_EXPIRED'
  | 'AUTH_TRANSACTION_REPLAY'
  | 'OIDC_VERIFICATION_FAILED'
  | 'IDENTITY_NOT_PROVISIONED';

export class AuthTransactionServiceError extends Error {
  public readonly code: AuthTransactionServiceErrorCode;

  public constructor(code: AuthTransactionServiceErrorCode) {
    super(code);
    this.name = 'AuthTransactionServiceError';
    this.code = code;
  }
}

export interface AuthTransactionSessionCreator {
  createSession(request: CreateSessionRequest): Promise<SessionTokenBundle>;
}

export interface AuthTransactionServiceDependencies {
  readonly transactions: AuthTransactionRepository;
  readonly providers: OidcProviderRegistry;
  readonly protector: AuthTransactionSecretProtector | null;
  readonly identities: IdentityContextStore;
  readonly sessions: AuthTransactionSessionCreator;
}

function validInstant(value: Date, field: string): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${field} is invalid`);
  }

  return value;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function equalHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function codeChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier, 'utf8')
    .digest('base64url');
}

function randomPkceVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function transactionProvider(
  providers: OidcProviderRegistry,
  providerKey: string | undefined,
): OidcProvider {
  const provider = providers.resolve(providerKey);
  if (provider !== null) {
    return provider;
  }

  throw new AuthTransactionServiceError(
    providers.hasConfiguredProvider()
      ? 'INVALID_AUTH_PROVIDER'
      : 'AUTH_PROVIDER_UNAVAILABLE',
  );
}

function mapProviderError(error: unknown): AuthTransactionServiceError {
  if (error instanceof OidcProviderUnavailableError) {
    return new AuthTransactionServiceError('AUTH_PROVIDER_UNAVAILABLE');
  }

  if (error instanceof OidcVerificationError) {
    return new AuthTransactionServiceError('OIDC_VERIFICATION_FAILED');
  }

  return new AuthTransactionServiceError('OIDC_VERIFICATION_FAILED');
}

function assertUserProvisioned(user: UserIdentity | null): UserIdentity {
  if (!user || user.status !== 'ACTIVE') {
    throw new AuthTransactionServiceError('IDENTITY_NOT_PROVISIONED');
  }

  return user;
}

export class AuthTransactionService {
  private readonly transactions: AuthTransactionRepository;
  private readonly providers: OidcProviderRegistry;
  private readonly protector: AuthTransactionSecretProtector | null;
  private readonly identities: IdentityContextStore;
  private readonly sessions: AuthTransactionSessionCreator;

  public constructor(
    dependencies: AuthTransactionServiceDependencies,
  ) {
    this.transactions = dependencies.transactions;
    this.providers = dependencies.providers;
    this.protector = dependencies.protector;
    this.identities = dependencies.identities;
    this.sessions = dependencies.sessions;
  }

  public async createTransaction(
    request: CreateAuthTransactionRequest = {},
  ): Promise<AuthTransactionAuthorization> {
    const provider = transactionProvider(
      this.providers,
      request.providerKey,
    );

    if (this.protector === null) {
      throw new AuthTransactionServiceError(
        'AUTH_PROVIDER_UNAVAILABLE',
      );
    }

    const now = validInstant(
      request.now ?? new Date(),
      'Auth transaction creation time',
    );
    const expiresAt = new Date(
      now.getTime() + TRANSACTION_TTL_MS,
    );
    const transactionId = randomUUID();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomPkceVerifier();
    const challenge = codeChallenge(verifier);

    await this.transactions.create({
      transactionId,
      providerKey: provider.configuration.key,
      stateHash: hashValue(state),
      nonceHash: hashValue(nonce),
      nonceCiphertext: this.protector.protect(nonce),
      pkceVerifierCiphertext: this.protector.protect(verifier),
      codeChallenge: challenge,
      redirectUri: provider.configuration.redirectUri,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      transactionId,
      authorizationUrl: provider.createAuthorizationUrl({
        state,
        nonce,
        codeChallenge: challenge,
      }),
      state,
      expiresAt: expiresAt.toISOString(),
    };
  }

  public async completeSession(
    request: CompleteAuthSessionRequest,
  ): Promise<SessionTokenBundle> {
    if (
      !UUID_PATTERN.test(request.transactionId) ||
      !request.code.trim() ||
      !request.state.trim()
    ) {
      throw new AuthTransactionServiceError(
        'INVALID_AUTH_TRANSACTION',
      );
    }

    const now = validInstant(
      request.now ?? new Date(),
      'Auth session completion time',
    );
    const transaction = await this.transactions.findById(
      request.transactionId,
    );

    if (!transaction) {
      throw new AuthTransactionServiceError(
        'INVALID_AUTH_TRANSACTION',
      );
    }

    if (transaction.status !== 'PENDING') {
      throw new AuthTransactionServiceError(
        transaction.status === 'EXPIRED'
          ? 'AUTH_TRANSACTION_EXPIRED'
          : 'AUTH_TRANSACTION_REPLAY',
      );
    }

    if (new Date(transaction.expiresAt) <= now) {
      await this.transactions.expire(
        transaction.transactionId,
        now.toISOString(),
      );
      throw new AuthTransactionServiceError(
        'AUTH_TRANSACTION_EXPIRED',
      );
    }

    if (!equalHash(transaction.stateHash, hashValue(request.state))) {
      throw new AuthTransactionServiceError(
        'INVALID_AUTH_TRANSACTION',
      );
    }

    const claimed = await this.transactions.claimForExchange({
      transactionId: transaction.transactionId,
      stateHash: transaction.stateHash,
      now: now.toISOString(),
    });

    if (!claimed) {
      throw new AuthTransactionServiceError(
        'AUTH_TRANSACTION_REPLAY',
      );
    }

    let terminal = false;
    const rejectTransaction = async (): Promise<void> => {
      terminal = true;
      await this.transactions.completeAtomically({
        transactionId: claimed.transactionId,
        status: 'REJECTED',
        completedAt: now.toISOString(),
      });
    };

    try {
      const provider = transactionProvider(
        this.providers,
        claimed.providerKey,
      );

      if (this.protector === null) {
        throw new AuthTransactionServiceError(
          'AUTH_PROVIDER_UNAVAILABLE',
        );
      }

      const verifier = this.protector.unprotect(
        claimed.pkceVerifierCiphertext,
      );
      const nonce = this.protector.unprotect(
        claimed.nonceCiphertext,
      );

      if (
        claimed.redirectUri !== provider.configuration.redirectUri ||
        !CODE_VERIFIER_PATTERN.test(verifier) ||
        codeChallenge(verifier) !== claimed.codeChallenge ||
        !equalHash(hashValue(nonce), claimed.nonceHash)
      ) {
        throw new AuthTransactionServiceError(
          'OIDC_VERIFICATION_FAILED',
        );
      }

      let identity: VerifiedOidcIdentity;
      try {
        const claims = await provider.exchangeAuthorizationCode({
          code: request.code,
          redirectUri: claimed.redirectUri,
          codeVerifier: verifier,
        });
        identity = provider.verifyIdentity(
          claims,
          nonce,
          now,
        );
      } catch (error) {
        throw mapProviderError(error);
      }

      if (
        identity.issuer !== provider.configuration.issuer ||
        !identity.subject.trim()
      ) {
        throw new AuthTransactionServiceError(
          'OIDC_VERIFICATION_FAILED',
        );
      }

      const user = assertUserProvisioned(
        await this.identities.findUserBySubject({
          issuer: identity.issuer,
          subject: identity.subject,
        }),
      );

      const tokens = await this.sessions.createSession({
        userId: user.id,
        subject: {
          issuer: identity.issuer,
          subject: identity.subject,
        },
        now,
      });

      const completed =
        await this.transactions.completeAtomically({
          transactionId: claimed.transactionId,
          status: 'CONSUMED',
          completedAt: now.toISOString(),
        });

      if (!completed) {
        throw new AuthTransactionServiceError(
          'AUTH_TRANSACTION_REPLAY',
        );
      }

      terminal = true;
      return tokens;
    } catch (error) {
      if (!terminal) {
        // Once an exchange is attempted, its outcome may be indeterminate.
        // Never reopen a claimed transaction, even on provider timeout.
        await rejectTransaction();
      }

      if (error instanceof AuthTransactionServiceError) {
        throw error;
      }

      throw new AuthTransactionServiceError(
        'OIDC_VERIFICATION_FAILED',
      );
    }
  }
}
