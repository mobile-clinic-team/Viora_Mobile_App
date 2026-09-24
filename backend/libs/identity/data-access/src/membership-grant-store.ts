import type { MembershipGrantStore } from '../../domain/src/index.ts';

export interface MembershipGrantQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly rows: readonly Row[];
}

export interface MembershipGrantQueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<MembershipGrantQueryResult<Row>>;
}

type PermissionRow = {
  readonly permission: string;
};

export class PostgresMembershipGrantStore implements MembershipGrantStore {
  private readonly database: MembershipGrantQueryClient;

  public constructor(database: MembershipGrantQueryClient) {
    this.database = database;
  }

  public async listPermissions(input: {
    readonly tenantId: string;
    readonly membershipId: string;
  }): Promise<readonly string[]> {
    const result = await this.database.query<PermissionRow>(
      `SELECT permission
         FROM membership_grants
        WHERE tenant_id = $1
          AND membership_id = $2
        ORDER BY permission ASC`,
      [input.tenantId, input.membershipId],
    );

    return result.rows.map((row) => row.permission);
  }
}
