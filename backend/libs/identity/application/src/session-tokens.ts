import {
  createHash,
  randomBytes,
} from 'node:crypto';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECRET =
  /^[A-Za-z0-9_-]{43}$/;

const ACCESS_PREFIX = 'viora_access_v1';
const REFRESH_PREFIX = 'viora_refresh_v1';

function createSecret(): string {
  return randomBytes(32).toString('base64url');
}

function createToken(
  prefix: string,
  id: string,
): string {
  if (!UUID.test(id)) {
    throw new Error('Token identifier is invalid');
  }

  return `${prefix}.${id}.${createSecret()}`;
}

function parseToken(
  value: string,
  expectedPrefix: string,
): string | null {
  const parts = value.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [prefix, id, secret] = parts;

  if (
    prefix !== expectedPrefix ||
    !UUID.test(id) ||
    !SECRET.test(secret)
  ) {
    return null;
  }

  return id;
}

export function createAccessToken(
  sessionId: string,
): string {
  return createToken(
    ACCESS_PREFIX,
    sessionId,
  );
}

export function createRefreshToken(
  refreshTokenId: string,
): string {
  return createToken(
    REFRESH_PREFIX,
    refreshTokenId,
  );
}

export function accessTokenSessionId(
  token: string,
): string | null {
  return parseToken(
    token,
    ACCESS_PREFIX,
  );
}

export function refreshTokenId(
  token: string,
): string | null {
  return parseToken(
    token,
    REFRESH_PREFIX,
  );
}

export function hashSessionToken(
  token: string,
): string {
  if (!token || token.length > 4096) {
    throw new Error('Token is invalid');
  }

  return createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}