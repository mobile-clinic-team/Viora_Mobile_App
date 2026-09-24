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

export interface SessionQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly rows: readonly Row[];
}

export interface SessionQueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SessionQueryResult<Row>>;
}

export interface SessionTransactionalDatabase extends SessionQueryClient {
  transaction<T>(
    work: (transaction: SessionQueryClient) => Promise<T>,
  ): Promise<T>;
}

export class SessionRepositoryInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SessionRepositoryInputError';
  }
}

type RefreshStateRow = {
  readonly token_id: string;
  readonly family_id: string;
  readonly session_id: string;
  readonly user_id: string;
  readonly token_status: 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED';
  readonly token_expires_at: string | Date;
  readonly family_status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly family_expires_at: string | Date;
  readonly session_status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly session_expires_at: string | Date;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SHA256 =
  /^[0-9a-f]{64}$/;

function uuid(value: string, field: string): string {
  if (!UUID.test(value)) {
    throw new SessionRepositoryInputError(`${field} is invalid`);
  }

  return value;
}

function hash(value: string, field: string): string {
  if (!SHA256.test(value)) {
    throw new SessionRepositoryInputError(`${field} must be a SHA-256 hex digest`);
  }

  return value;
}

function instant(value: string, field: string): Date {
  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new SessionRepositoryInputError(`${field} is invalid`);
  }

  return parsed;
}

function iso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function revokeFamily(
  transaction: SessionQueryClient,
  row: RefreshStateRow,
  revokedAt: string,
): Promise<void> {
  await transaction.query(
    `UPDATE refresh_tokens
        SET status = 'REVOKED',
            revoked_at = COALESCE(revoked_at, $2::timestamptz)
      WHERE family_id = $1
        AND status IN ('ACTIVE', 'ROTATED')`,
    [row.family_id, revokedAt],
  );

  await transaction.query(
    `UPDATE refresh_families
        SET status = 'REVOKED',
            revoked_at = COALESCE(revoked_at, $2::timestamptz)
      WHERE id = $1
        AND status <> 'EXPIRED'`,
    [row.family_id, revokedAt],
  );

  await transaction.query(
    `UPDATE sessions
        SET status = 'REVOKED',
            revoked_at = COALESCE(revoked_at, $2::timestamptz),
            last_seen_at = $2::timestamptz
      WHERE id = $1
        AND status <> 'EXPIRED'`,
    [row.session_id, revokedAt],
  );
}

async function expireFamily(
  transaction: SessionQueryClient,
  row: RefreshStateRow,
): Promise<void> {
  await transaction.query(
    `UPDATE refresh_tokens
        SET status = 'EXPIRED'
      WHERE family_id = $1
        AND status = 'ACTIVE'`,
    [row.family_id],
  );

  await transaction.query(
    `UPDATE refresh_families
        SET status = 'EXPIRED'
      WHERE id = $1
        AND status = 'ACTIVE'`,
    [row.family_id],
  );

  await transaction.query(
    `UPDATE sessions
        SET status = 'EXPIRED'
      WHERE id = $1
        AND status = 'ACTIVE'`,
    [row.session_id],
  );
}

export class PostgresSessionRepository implements SessionRepository {
  private readonly database: SessionTransactionalDatabase;

  public constructor(database: SessionTransactionalDatabase) {
    this.database = database;
  }

  public async findActiveAccessSession(
    input: AccessSessionLookupInput,
  ): Promise<AccessSessionLookup | null> {
    uuid(input.sessionId, 'sessionId');

    hash(
      input.presentedAccessTokenHash,
      'presentedAccessTokenHash',
    );

    instant(input.now, 'now');

    const result = await this.database.query<{
        session_id: string;
        user_id: string;
        identity_issuer: string;
        identity_subject: string;
        access_expires_at: string | Date;
        expires_at: string | Date;
    }>(
      `SELECT
        id AS session_id,
        user_id,
        identity_issuer,
        identity_subject,
        access_expires_at,
        expires_at
       FROM sessions
      WHERE id = $1
        AND access_token_hash = decode($2, 'hex')
        AND status = 'ACTIVE'
        AND access_expires_at > $3::timestamptz
        AND expires_at > $3::timestamptz`,
      [
        input.sessionId,
        input.presentedAccessTokenHash,
        input.now,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
        sessionId: row.session_id,
        userId: row.user_id,
        identityIssuer: row.identity_issuer,
        identitySubject: row.identity_subject,
        accessExpiresAt:
            iso(row.access_expires_at),
        expiresAt:
            iso(row.expires_at),
    };
  }

  public async create(input: CreateSessionInput): Promise<void> {
    uuid(input.sessionId, 'sessionId');
    uuid(input.userId, 'userId');

    if (
      !input.identityIssuer.trim() ||
      input.identityIssuer.length > 2048
    ) {
      throw new SessionRepositoryInputError(
        'identityIssuer is invalid',
      );
    }

    if (
      !input.identitySubject.trim() ||
      input.identitySubject.length > 1024
    ) {
      throw new SessionRepositoryInputError(
        'identitySubject is invalid',
      );
    }

    uuid(input.familyId, 'familyId');
    uuid(input.refreshTokenId, 'refreshTokenId');

    hash(input.accessTokenHash, 'accessTokenHash');
    hash(input.refreshTokenHash, 'refreshTokenHash');

    const createdAt = instant(input.createdAt, 'createdAt');
    const expiresAt = instant(input.expiresAt, 'expiresAt');

    const accessExpiresAt = instant(
      input.accessExpiresAt,
      'accessExpiresAt',
    );

    if (expiresAt <= createdAt) {
      throw new SessionRepositoryInputError(
        'expiresAt must be later than createdAt',
      );
    }

    if (
      accessExpiresAt <= createdAt ||
      accessExpiresAt > expiresAt
    ) {
      throw new SessionRepositoryInputError(
        'accessExpiresAt must be after createdAt and no later than expiresAt',
      );
    }

    await this.database.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO sessions
          (id, user_id, identity_issuer, identity_subject,
           access_token_hash, access_expires_at, status,
           created_at, last_seen_at, expires_at, revoked_at)
         VALUES
          ($1, $2, $3, $4,
           decode($5, 'hex'), $6::timestamptz, 'ACTIVE',
           $7::timestamptz, $7::timestamptz, $8::timestamptz, NULL)`,
        [
          input.sessionId,
          input.userId,
          input.identityIssuer,
          input.identitySubject,
          input.accessTokenHash,
          input.accessExpiresAt,
          input.createdAt,
          input.expiresAt,
        ],
      );

      await transaction.query(
        `INSERT INTO refresh_families
          (id, session_id, user_id, status,
           created_at, expires_at, revoked_at)
         VALUES
          ($1, $2, $3, 'ACTIVE',
           $4::timestamptz, $5::timestamptz, NULL)`,
        [
          input.familyId,
          input.sessionId,
          input.userId,
          input.createdAt,
          input.expiresAt,
        ],
      );

      await transaction.query(
        `INSERT INTO refresh_tokens
          (id, family_id, token_hash, status,
           issued_at, expires_at, rotated_at, revoked_at)
         VALUES
          ($1, $2, decode($3, 'hex'), 'ACTIVE',
           $4::timestamptz, $5::timestamptz, NULL, NULL)`,
        [
          input.refreshTokenId,
          input.familyId,
          input.refreshTokenHash,
          input.createdAt,
          input.expiresAt,
        ],
      );
    });
  }

  public async findRefreshSession(
    input: RefreshSessionLookupInput,
  ): Promise<RefreshSessionLookup | null> {
    uuid(input.tokenId, 'tokenId');
    hash(
      input.presentedTokenHash,
      'presentedTokenHash',
    );

    const result = await this.database.query<{
      session_id: string;
      user_id: string;
      expires_at: string | Date;
    }>(
      `SELECT
         s.id AS session_id,
         s.user_id,
         s.expires_at
       FROM refresh_tokens rt
       JOIN refresh_families rf
         ON rf.id = rt.family_id
       JOIN sessions s
         ON s.id = rf.session_id
        AND s.user_id = rf.user_id
      WHERE rt.id = $1
        AND rt.token_hash = decode($2, 'hex')`,
      [
        input.tokenId,
        input.presentedTokenHash,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      expiresAt: iso(row.expires_at),
    };
  }

  public async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshRotationResult> {
    uuid(input.tokenId, 'tokenId');
    uuid(input.nextTokenId, 'nextTokenId');

    hash(input.presentedTokenHash, 'presentedTokenHash');
    hash(input.nextTokenHash, 'nextTokenHash');
    hash(input.nextAccessTokenHash, 'nextAccessTokenHash');

    const rotatedAt = instant(
      input.rotatedAt,
      'rotatedAt',
    );

    const nextAccessExpiresAt = instant(
      input.nextAccessExpiresAt,
      'nextAccessExpiresAt',
    );

    return this.database.transaction(async (transaction) => {
      const selected = await transaction.query<RefreshStateRow>(
        `SELECT
           rt.id AS token_id,
           rt.family_id,
           rf.session_id,
           rf.user_id,
           rt.status AS token_status,
           rt.expires_at AS token_expires_at,
           rf.status AS family_status,
           rf.expires_at AS family_expires_at,
           s.status AS session_status,
           s.expires_at AS session_expires_at
         FROM refresh_tokens rt
         JOIN refresh_families rf
           ON rf.id = rt.family_id
         JOIN sessions s
           ON s.id = rf.session_id
          AND s.user_id = rf.user_id
        WHERE rt.id = $1
          AND rt.token_hash = decode($2, 'hex')
        FOR UPDATE OF rt, rf, s`,
        [input.tokenId, input.presentedTokenHash],
      );

      const row = selected.rows[0];

      if (!row) {
        return { kind: 'INVALID' };
      }

      if (
        row.session_status === 'REVOKED' ||
        row.family_status === 'REVOKED' ||
        row.token_status === 'REVOKED'
      ) {
        return { kind: 'REVOKED' };
      }

      if (row.token_status === 'ROTATED') {
        await revokeFamily(transaction, row, input.rotatedAt);

        return {
          kind: 'REPLAY_DETECTED',
          sessionId: row.session_id,
          userId: row.user_id,
          familyId: row.family_id,
        };
      }

      const tokenExpiry = new Date(row.token_expires_at);
      const familyExpiry = new Date(row.family_expires_at);
      const sessionExpiry = new Date(row.session_expires_at);

      if (
        row.token_status === 'EXPIRED' ||
        row.family_status === 'EXPIRED' ||
        row.session_status === 'EXPIRED' ||
        tokenExpiry <= rotatedAt ||
        familyExpiry <= rotatedAt ||
        sessionExpiry <= rotatedAt
      ) {
        await expireFamily(transaction, row);
        return { kind: 'EXPIRED' };
      }

      if (
        familyExpiry.getTime() !==
        sessionExpiry.getTime()
      ) {
        throw new SessionRepositoryInputError(
          'refresh family expiry does not match session expiry',
        );
      }

      if (
        nextAccessExpiresAt <= rotatedAt ||
        nextAccessExpiresAt > sessionExpiry
      ) {
        throw new SessionRepositoryInputError(
          'nextAccessExpiresAt must be after rotatedAt and no later than session expiry',
        );
      }

      const rotated = await transaction.query<{ id: string }>(
        `UPDATE refresh_tokens
            SET status = 'ROTATED',
                rotated_at = $2::timestamptz
          WHERE id = $1
            AND status = 'ACTIVE'
          RETURNING id`,
        [row.token_id, input.rotatedAt],
      );

      if (!rotated.rows[0]) {
        throw new SessionRepositoryInputError(
          'refresh token could not be rotated',
        );
      }

      await transaction.query(
        `INSERT INTO refresh_tokens
          (id, family_id, token_hash, status,
           issued_at, expires_at, rotated_at, revoked_at)
         VALUES
          ($1, $2, decode($3, 'hex'), 'ACTIVE',
           $4::timestamptz, $5::timestamptz, NULL, NULL)`,
        [
          input.nextTokenId,
          row.family_id,
          input.nextTokenHash,
          input.rotatedAt,
          iso(familyExpiry),
        ],
      );

      await transaction.query(
        `UPDATE sessions
            SET access_token_hash = decode($2, 'hex'),
                access_expires_at = $3::timestamptz,
                last_seen_at = $4::timestamptz
            WHERE id = $1
            AND status = 'ACTIVE'`,
        [
          row.session_id,
          input.nextAccessTokenHash,
          input.nextAccessExpiresAt,
          input.rotatedAt,
        ],
      );

      return {
        kind: 'ROTATED',
        sessionId: row.session_id,
        userId: row.user_id,
        familyId: row.family_id,
        expiresAt: iso(row.family_expires_at),
      };
    });
  }

  public async revokeSession(
    input: RevokeSessionInput,
  ): Promise<boolean> {
    uuid(input.sessionId, 'sessionId');
    uuid(input.userId, 'userId');
    instant(input.revokedAt, 'revokedAt');

    return this.database.transaction(async (transaction) => {
      const session = await transaction.query<{ id: string }>(
        `SELECT id
           FROM sessions
          WHERE id = $1
            AND user_id = $2
          FOR UPDATE`,
        [input.sessionId, input.userId],
      );

      if (!session.rows[0]) {
        return false;
      }

      await transaction.query(
        `UPDATE refresh_tokens
            SET status = 'REVOKED',
                revoked_at = COALESCE(
                  revoked_at,
                  $2::timestamptz
                )
          WHERE family_id IN (
            SELECT id
              FROM refresh_families
             WHERE session_id = $1
          )
            AND status IN ('ACTIVE', 'ROTATED')`,
        [input.sessionId, input.revokedAt],
      );

      await transaction.query(
        `UPDATE refresh_families
            SET status = 'REVOKED',
                revoked_at = COALESCE(
                  revoked_at,
                  $2::timestamptz
                )
          WHERE session_id = $1
            AND status = 'ACTIVE'`,
        [input.sessionId, input.revokedAt],
      );

      await transaction.query(
        `UPDATE sessions
            SET status = 'REVOKED',
                revoked_at = COALESCE(
                  revoked_at,
                  $3::timestamptz
                ),
                last_seen_at = $3::timestamptz
          WHERE id = $1
            AND user_id = $2
            AND status = 'ACTIVE'`,
        [
          input.sessionId,
          input.userId,
          input.revokedAt,
        ],
      );

      return true;
    });
  }
}