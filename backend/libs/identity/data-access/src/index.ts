import type { IdentityContextStore } from '../../domain/src/index.ts';

import type {
  IdentitySubjectReference,
  Membership,
  UserIdentity,
} from '../../contracts/src/index.ts';

export interface IdentityQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly rows: readonly Row[];
}

export interface IdentityQueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<IdentityQueryResult<Row>>;
}

type UserRow = {
  readonly id: string;
  readonly status: UserIdentity['status'];
  readonly issuer: string;
  readonly subject: string;
};

type MembershipRow = {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly role: string;
  readonly status: Membership['status'];
  readonly permission_revision: string;
};

function toUserIdentity(row: UserRow): UserIdentity {
  return {
    id: row.id,
    status: row.status,
    subject: {
      issuer: row.issuer,
      subject: row.subject,
    },
  };
}

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
    status: row.status,
    permissionRevision: `"${row.permission_revision}"`,
  };
}

/**
 * PostgreSQL adapter for resolving external OIDC identities into
 * Viora users and tenant memberships.
 */
export class PostgresIdentityContextStore implements IdentityContextStore {
  private readonly database: IdentityQueryClient;

  public constructor(database: IdentityQueryClient) {
    this.database = database;
  }

  public async findUserBySubject(
    subject: IdentitySubjectReference,
  ): Promise<UserIdentity | null> {
    const result = await this.database.query<UserRow>(
      `SELECT u.id,
              u.status,
              identity_subjects.issuer,
              identity_subjects.subject
         FROM identity_subjects
         JOIN users u
           ON u.id = identity_subjects.user_id
        WHERE identity_subjects.issuer = $1
          AND identity_subjects.subject = $2`,
      [subject.issuer, subject.subject],
    );

    const row = result.rows[0];
    return row ? toUserIdentity(row) : null;
  }

  public async findMembershipsByUser(
    userId: string,
  ): Promise<readonly Membership[]> {
    const result = await this.database.query<MembershipRow>(
      `SELECT id,
              user_id,
              tenant_id,
              role,
              status,
              permission_revision
         FROM memberships
        WHERE user_id = $1
        ORDER BY tenant_id ASC, id ASC`,
      [userId],
    );

    return result.rows.map(toMembership);
  }
}

export {
  PostgresSessionRepository,
  SessionRepositoryInputError,
} from './session-repository.ts';

export type {
  SessionQueryClient,
  SessionTransactionalDatabase,
} from './session-repository.ts';

export {
  AuthTransactionRepositoryInputError,
  PostgresAuthTransactionRepository,
} from './auth-transaction-repository.ts';

export type {
  AuthTransactionDatabase,
  AuthTransactionQueryClient,
  AuthTransactionQueryResult,
} from './auth-transaction-repository.ts';

export { PostgresMembershipGrantStore } from './membership-grant-store.ts';

export type {
  MembershipGrantQueryClient,
  MembershipGrantQueryResult,
} from './membership-grant-store.ts';
