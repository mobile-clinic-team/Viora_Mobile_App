export interface MembershipGrantStore {
  listPermissions(input: {
    readonly tenantId: string;
    readonly membershipId: string;
  }): Promise<readonly string[]>;
}