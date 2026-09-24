export interface PasswordCredential {
  userId: string; passwordHash: string; status: string;
}
export interface PasswordCredentialStore {
  create(input: { email: string; displayName: string; passwordHash: string }): Promise<boolean>;
  find(email: string): Promise<PasswordCredential | null>;
}
export const PASSWORD_ISSUER = 'urn:viora:password';
