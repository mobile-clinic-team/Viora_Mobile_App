export interface StepUpBinding {
  readonly actorId: string;
  readonly sessionId: string;
  readonly tenantId: string;
  readonly draftId: string;
  readonly draftVersion: string;
  readonly targetRecordId: string;
  readonly targetVersionToken: string;
}

export type AuthTransactionStatus =
  | 'PENDING'
  | 'EXCHANGING'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'REJECTED';

export interface AuthTransaction {
  readonly stepUp?: StepUpBinding;
  readonly transactionId: string;
  readonly providerKey: string;
  readonly stateHash: string;
  readonly nonceHash: string;
  readonly nonceCiphertext: string;
  readonly pkceVerifierCiphertext: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly status: AuthTransactionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

export interface CreateAuthTransactionInput {
  readonly stepUp?: StepUpBinding;
  readonly transactionId: string;
  readonly providerKey: string;
  readonly stateHash: string;
  readonly nonceHash: string;
  readonly nonceCiphertext: string;
  readonly pkceVerifierCiphertext: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ClaimAuthTransactionInput {
  readonly transactionId: string;
  readonly stateHash: string;
  readonly now: string;
}

export interface CompleteAuthTransactionInput {
  readonly transactionId: string;
  readonly status: 'CONSUMED' | 'REJECTED';
  readonly completedAt: string;
}

export interface AuthTransactionRepository {
  create(input: CreateAuthTransactionInput): Promise<void>;

  findById(transactionId: string): Promise<AuthTransaction | null>;

  findPendingById(transactionId: string): Promise<AuthTransaction | null>;

  claimForExchange(
    input: ClaimAuthTransactionInput,
  ): Promise<AuthTransaction | null>;

  completeAtomically(
    input: CompleteAuthTransactionInput,
  ): Promise<boolean>;

  releaseExchange(transactionId: string): Promise<boolean>;

  expire(transactionId: string, now: string): Promise<boolean>;
}
