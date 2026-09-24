import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessTokenSessionId,
  createAccessToken,
  createRefreshToken,
  hashSessionToken,
  refreshTokenId,
} from './session-tokens.ts';

const sessionId =
  '00000000-0000-0000-0000-000000000401';

const refreshId =
  '00000000-0000-0000-0000-000000000402';

test('creates opaque access tokens bound to a session id', () => {
  const first =
    createAccessToken(sessionId);

  const second =
    createAccessToken(sessionId);

  assert.notEqual(first, second);

  assert.equal(
    accessTokenSessionId(first),
    sessionId,
  );

  assert.equal(
    accessTokenSessionId(second),
    sessionId,
  );

  assert.equal(
    refreshTokenId(first),
    null,
  );
});

test('creates opaque refresh tokens bound to a refresh-token id', () => {
  const first =
    createRefreshToken(refreshId);

  const second =
    createRefreshToken(refreshId);

  assert.notEqual(first, second);

  assert.equal(
    refreshTokenId(first),
    refreshId,
  );

  assert.equal(
    accessTokenSessionId(first),
    null,
  );
});

test('hashes tokens without retaining plaintext', () => {
  const token =
    createRefreshToken(refreshId);

  const hash =
    hashSessionToken(token);

  assert.match(
    hash,
    /^[0-9a-f]{64}$/,
  );

  assert.equal(
    hash,
    hashSessionToken(token),
  );

  assert.equal(
    hash.includes(token),
    false,
  );
});

test('rejects malformed tokens', () => {
  assert.equal(
    accessTokenSessionId(''),
    null,
  );

  assert.equal(
    accessTokenSessionId('not-a-token'),
    null,
  );

  assert.equal(
    refreshTokenId(
      `viora_refresh_v1.${refreshId}.short`,
    ),
    null,
  );

  assert.throws(
    () =>
      createAccessToken('invalid-id'),
    /identifier is invalid/,
  );
});