import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

export interface AuthTransactionSecretProtector {
  protect(value: string): string;

  unprotect(ciphertext: string): string;
}

export class NodeAuthTransactionSecretProtector
  implements AuthTransactionSecretProtector {
  private readonly key: Buffer;

  public constructor(key: Uint8Array) {
    if (key.byteLength !== 32) {
      throw new Error('OIDC transaction encryption key must be 32 bytes');
    }

    this.key = Buffer.from(key);
  }

  public protect(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  public unprotect(ciphertext: string): string {
    const parts = ciphertext.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('OIDC transaction ciphertext is invalid');
    }

    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const encrypted = Buffer.from(parts[3], 'base64url');

    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('OIDC transaction ciphertext is invalid');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function createNodeAuthTransactionSecretProtector(
  encodedKey: string,
): NodeAuthTransactionSecretProtector {
  const value = encodedKey.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64url');

  return new NodeAuthTransactionSecretProtector(key);
}
