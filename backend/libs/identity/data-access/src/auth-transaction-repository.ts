import type {
  AuthTransaction,
  AuthTransactionRepository,
  AuthTransactionStatus,
  ClaimAuthTransactionInput,
  CompleteAuthTransactionInput,
  CreateAuthTransactionInput,
  StepUpBinding,
} from '../../domain/src/auth-transaction.ts';

export interface AuthTransactionQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly rows: readonly Row[];
}

export interface AuthTransactionQueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<AuthTransactionQueryResult<Row>>;
}

export interface AuthTransactionDatabase
  extends AuthTransactionQueryClient {
  transaction<T>(
    work: (transaction: AuthTransactionQueryClient) => Promise<T>,
  ): Promise<T>;
}

export class AuthTransactionRepositoryInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthTransactionRepositoryInputError';
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

function uuid(value: string, field: string): void {
  if (!UUID.test(value)) {
    throw new AuthTransactionRepositoryInputError(`${field} is invalid`);
  }
}

function sha256(value: string, field: string): void {
  if (!SHA256.test(value)) {
    throw new AuthTransactionRepositoryInputError(`${field} is invalid`);
  }
}

function instant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AuthTransactionRepositoryInputError(`${field} is invalid`);
  }

  return parsed;
}

function boundedText(
  value: string,
  field: string,
  maxLength: number,
): void {
  if (!value.trim() || value.length > maxLength) {
    throw new AuthTransactionRepositoryInputError(`${field} is invalid`);
  }
}

type AuthTransactionRow = {
  readonly step_up_binding: StepUpBinding | null;
  readonly id: string;
  readonly provider_key: string;
  readonly state_hash: Buffer;
  readonly nonce_hash: Buffer;
  readonly nonce_ciphertext: string;
  readonly pkce_verifier_ciphertext: string;
  readonly code_challenge: string;
  readonly redirect_uri: string;
  readonly status: AuthTransactionStatus;
  readonly created_at: string | Date;
  readonly expires_at: string | Date;
  readonly consumed_at: string | Date | null;
};

function toAuthTransaction(row: AuthTransactionRow): AuthTransaction {
  return {
    ...(row.step_up_binding ? { stepUp: row.step_up_binding } : {}),
    transactionId: row.id,
    providerKey: row.provider_key,
    stateHash: Buffer.from(row.state_hash).toString('hex'),
    nonceHash: Buffer.from(row.nonce_hash).toString('hex'),
    nonceCiphertext: row.nonce_ciphertext,
    pkceVerifierCiphertext: row.pkce_verifier_ciphertext,
    codeChallenge: row.code_challenge,
    redirectUri: row.redirect_uri,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    consumedAt: row.consumed_at === null
      ? null
      : new Date(row.consumed_at).toISOString(),
  };
}

const SELECT_COLUMNS = `
  SELECT id,
         step_up_binding,
         provider_key,
         state_hash,
         nonce_hash,
         nonce_ciphertext,
         pkce_verifier_ciphertext,
         code_challenge,
         redirect_uri,
         status,
         created_at,
         expires_at,
         consumed_at
    FROM auth_transactions`;

export class PostgresAuthTransactionRepository
  implements AuthTransactionRepository {
  private readonly database: AuthTransactionDatabase;

  public constructor(database: AuthTransactionDatabase) {
    this.database = database;
  }

  public async create(input: CreateAuthTransactionInput): Promise<void> {
    uuid(input.transactionId, 'transactionId');
    boundedText(input.providerKey, 'providerKey', 128);
    sha256(input.stateHash, 'stateHash');
    sha256(input.nonceHash, 'nonceHash');
    boundedText(input.nonceCiphertext, 'nonceCiphertext', 8192);
    boundedText(
      input.pkceVerifierCiphertext,
      'pkceVerifierCiphertext',
      8192,
    );

    if (!CODE_CHALLENGE.test(input.codeChallenge)) {
      throw new AuthTransactionRepositoryInputError(
        'codeChallenge is invalid',
      );
    }

    boundedText(input.redirectUri, 'redirectUri', 2048);
    const createdAt = instant(input.createdAt, 'createdAt');
    const expiresAt = instant(input.expiresAt, 'expiresAt');

    if (expiresAt <= createdAt) {
      throw new AuthTransactionRepositoryInputError(
        'expiresAt must be later than createdAt',
      );
    }

    await this.database.query(
      `INSERT INTO auth_transactions
        (id, purpose, code_challenge, status, expires_at, consumed_at,
         created_at, provider_key, state_hash, nonce_hash,
         nonce_ciphertext, pkce_verifier_ciphertext, redirect_uri, step_up_binding)
       VALUES
        ($1, $11::auth_transaction_purpose, $2, 'PENDING', $3::timestamptz, NULL,
         $4::timestamptz, $5, decode($6, 'hex'), decode($7, 'hex'),
         $8, $9, $10, $12::jsonb)`,
      [
        input.transactionId,
        input.codeChallenge,
        input.expiresAt,
        input.createdAt,
        input.providerKey,
        input.stateHash,
        input.nonceHash,
        input.nonceCiphertext,
        input.pkceVerifierCiphertext,
        input.redirectUri,
        input.stepUp ? 'STEP_UP' : 'LOGIN',
        input.stepUp ? JSON.stringify(input.stepUp) : null,
      ],
    );
  }

  public async findById(
    transactionId: string,
  ): Promise<AuthTransaction | null> {
    uuid(transactionId, 'transactionId');

    const result = await this.database.query<AuthTransactionRow>(
      `${SELECT_COLUMNS}
     WHERE id = $1`,
      [transactionId],
    );

    const row = result.rows[0];
    return row === undefined ? null : toAuthTransaction(row);
  }

  public async findPendingById(
    transactionId: string,
  ): Promise<AuthTransaction | null> {
    const transaction = await this.findById(transactionId);
    return transaction?.status === 'PENDING' ? transaction : null;
  }

  public async claimForExchange(
    input: ClaimAuthTransactionInput,
  ): Promise<AuthTransaction | null> {
    uuid(input.transactionId, 'transactionId');
    sha256(input.stateHash, 'stateHash');
    instant(input.now, 'now');

    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<AuthTransactionRow>(
        `${SELECT_COLUMNS}
         WHERE id = $1
           AND state_hash = decode($2, 'hex')
           AND status = 'PENDING'
           AND expires_at > $3::timestamptz
         FOR UPDATE`,
        [input.transactionId, input.stateHash, input.now],
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      const claimed = await transaction.query<AuthTransactionRow>(
        `UPDATE auth_transactions
            SET status = 'EXCHANGING'
          WHERE id = $1
            AND status = 'PENDING'
         RETURNING id,
                   step_up_binding,
                   provider_key,
                   state_hash,
                   nonce_hash,
                   nonce_ciphertext,
                   pkce_verifier_ciphertext,
                   code_challenge,
                   redirect_uri,
                   status,
                   created_at,
                   expires_at,
                   consumed_at`,
        [input.transactionId],
      );

      const claimedRow = claimed.rows[0];
      return claimedRow === undefined
        ? null
        : toAuthTransaction(claimedRow);
    });
  }

  public async completeAtomically(
    input: CompleteAuthTransactionInput,
  ): Promise<boolean> {
    uuid(input.transactionId, 'transactionId');
    instant(input.completedAt, 'completedAt');

    const result = await this.database.query<{ id: string }>(
      `UPDATE auth_transactions
          SET status = $2::auth_transaction_status,
              consumed_at = $3::timestamptz
        WHERE id = $1
          AND status = 'EXCHANGING'
          AND consumed_at IS NULL
       RETURNING id`,
      [input.transactionId, input.status, input.completedAt],
    );

    return result.rows.length === 1;
  }

  public async releaseExchange(transactionId: string): Promise<boolean> {
    uuid(transactionId, 'transactionId');

    const result = await this.database.query<{ id: string }>(
      `UPDATE auth_transactions
          SET status = 'PENDING'
        WHERE id = $1
          AND status = 'EXCHANGING'
       RETURNING id`,
      [transactionId],
    );

    return result.rows.length === 1;
  }

  public async expire(
    transactionId: string,
    now: string,
  ): Promise<boolean> {
    uuid(transactionId, 'transactionId');
    instant(now, 'now');

    const result = await this.database.query<{ id: string }>(
      `UPDATE auth_transactions
          SET status = 'EXPIRED'
        WHERE id = $1
          AND status IN ('PENDING', 'EXCHANGING')
          AND expires_at <= $2::timestamptz
       RETURNING id`,
      [transactionId, now],
    );

    return result.rows.length === 1;
  }
}
