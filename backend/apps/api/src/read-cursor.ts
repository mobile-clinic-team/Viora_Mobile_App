import { createNodeAuthTransactionSecretProtector } from '../../../libs/identity/application-entrypoint/src/index.ts';
import { ReadError, type ReadCursorCodec } from '../../../libs/platform/context/src/read-page.ts';

export function createReadCursorCodec(key: string | undefined): ReadCursorCodec | null {
  if (key === undefined || key.trim() === '') return null;
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('VIORA_READ_CURSOR_ENCRYPTION_KEY must be 32 bytes encoded as hex');
  const protector = createNodeAuthTransactionSecretProtector(key);
  return {
    encode(binding, position) { return protector.protect(JSON.stringify({ version: 1, binding, position })); },
    decode(cursor, binding) {
      let value;
      try {
        if (typeof cursor !== 'string' || cursor.length > 16384) throw new Error();
        const parts = cursor.split('.');
        if (parts.length !== 4 || parts[0] !== 'v1' || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part) || Buffer.from(part, 'base64url').toString('base64url') !== part)) throw new Error();
        value = JSON.parse(protector.unprotect(cursor));
        if (value.version !== 1 || !Array.isArray(value.position) || !value.position.length || value.position.some((part: unknown) => typeof part !== 'string') ||
          value.binding.tenantId !== binding.tenantId || value.binding.purpose !== binding.purpose || value.binding.sort !== binding.sort || value.binding.query !== binding.query || typeof value.binding.permissionRevision !== 'string') throw new Error();
      } catch { throw new ReadError('INVALID_PAGINATION_CURSOR'); }
      if (value.binding.permissionRevision !== binding.permissionRevision) throw new ReadError('CONTEXT_STALE');
      return value.position;
    },
  };
}
