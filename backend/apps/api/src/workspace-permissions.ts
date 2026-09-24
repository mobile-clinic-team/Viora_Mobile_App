export interface WorkspacePermissionStore {
  listPermissions(input: {
    readonly tenantId: string;
    readonly membershipId: string;
  }): Promise<readonly string[]>;
}

export async function loadWorkspacePermissions(
  store: WorkspacePermissionStore,
  input: {
    readonly tenantId: string;
    readonly membershipId: string;
  },
): Promise<ReadonlySet<string>> {
  const permissions = await store.listPermissions(input);

  return new Set(permissions);
}