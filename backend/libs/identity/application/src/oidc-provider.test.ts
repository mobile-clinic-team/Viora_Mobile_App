import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ConfiguredOidcProvider, OidcVerificationError, OidcProviderUnavailableError } from './oidc-provider.ts';

const config = {
  key: 'google', issuer: 'https://accounts.google.com', clientId: 'test-client',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  redirectUri: 'https://app.example.test/callback', scopes: ['openid'],
};
const input = { code: 'test-code', codeVerifier: 'a'.repeat(43), redirectUri: config.redirectUri };
const pair = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };

async function fixture(overrides: Record<string, unknown> = {}, alg = 'RS256') {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ iss: config.issuer, sub: 'subject', aud: config.clientId,
    nonce: 'test-nonce', iat: now, exp: now + 300, ...overrides })
    .setProtectedHeader({ alg, kid: 'test-key' }).sign(pair.privateKey);
  const requests: RequestInit[] = [];
  const provider = new ConfiguredOidcProvider(config, async (url, init) => {
    if (String(url) === config.jwksUri) return Response.json({ keys: [jwk] });
    assert.equal(String(url), config.tokenEndpoint);
    requests.push(init!);
    return Response.json({ id_token: token });
  });
  return { provider, requests };
}

test('real adapter exchanges PKCE code and verifies signed JWKS identity', async () => {
  const { provider, requests } = await fixture();
  const claims = await provider.exchangeAuthorizationCode(input);
  assert.deepEqual(provider.verifyIdentity(claims, 'test-nonce', new Date()), { issuer: config.issuer, subject: 'subject' });
  const body = requests[0].body as URLSearchParams;
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code_verifier'), input.codeVerifier);
  assert.equal(body.get('client_id'), config.clientId);
  assert.equal(body.has('client_secret'), false);
  assert.equal(requests[0].redirect, 'error');
  assert.ok(requests[0].signal);
  assert.throws(() => provider.verifyIdentity(claims, 'test-nonce', new Date()), OidcVerificationError);
});

for (const [name, change] of Object.entries({
  issuer: { iss: 'https://wrong.example.test' }, audience: { aud: 'wrong' },
  expired: { exp: 1 }, futureIat: { iat: Math.floor(Date.now() / 1000) + 3600 },
  oldIat: { iat: 1 }, missingIat: { iat: undefined }, missingExp: { exp: undefined },
  blankSubject: { sub: ' ' }, missingNonce: { nonce: undefined },
  multiAudienceMissingAzp: { aud: [config.clientId, 'other'] }, badAzp: { azp: 'other' },
})) {
  test(`OIDC rejects ${name}`, async () => {
    const { provider } = await fixture(change);
    await assert.rejects(provider.exchangeAuthorizationCode(input), OidcVerificationError);
  });
}

test('nonce mismatch and unverified caller-supplied claims fail closed', async () => {
  const { provider } = await fixture();
  const claims = await provider.exchangeAuthorizationCode(input);
  assert.throws(() => provider.verifyIdentity(claims, 'wrong', new Date()), OidcVerificationError);
  assert.throws(() => provider.verifyIdentity({ ...claims }, 'test-nonce', new Date()), OidcVerificationError);
});

test('multi-audience with matching authorized party is accepted', async () => {
  const { provider } = await fixture({ aud: [config.clientId, 'other'], azp: config.clientId });
  const claims = await provider.exchangeAuthorizationCode(input);
  assert.equal(provider.verifyIdentity(claims, 'test-nonce', new Date()).subject, 'subject');
});

test('invalid signature, unknown key and disallowed algorithm fail closed', async () => {
  const other = await generateKeyPair('RS256');
  for (const [kid, key] of [['test-key', other.privateKey], ['missing', pair.privateKey]] as const) {
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid }).sign(key);
    const provider = new ConfiguredOidcProvider(config, async url => Response.json(
      String(url) === config.jwksUri ? { keys: [jwk] } : { id_token: token },
    ));
    await assert.rejects(provider.exchangeAuthorizationCode(input), OidcVerificationError);
  }
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32));
  const provider = new ConfiguredOidcProvider(config, async () => Response.json({ id_token: token }));
  await assert.rejects(provider.exchangeAuthorizationCode(input), OidcVerificationError);
});

test('upstream errors and network failures never leak response bodies', async () => {
  for (const status of [400, 429, 500]) {
    const provider = new ConfiguredOidcProvider(config, async () => new Response('secret-upstream-body', { status }));
    await assert.rejects(provider.exchangeAuthorizationCode(input), error => {
      assert.ok(error instanceof OidcVerificationError || error instanceof OidcProviderUnavailableError);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
  const provider = new ConfiguredOidcProvider(config, async () => { throw new Error('private network details'); });
  await assert.rejects(provider.exchangeAuthorizationCode(input), OidcProviderUnavailableError);
});

test('configuration requires HTTPS and configured JWKS; redirect cannot be replaced', async () => {
  assert.throws(() => new ConfiguredOidcProvider({ ...config, tokenEndpoint: 'http://localhost/token' }));
  await assert.rejects(new ConfiguredOidcProvider({ ...config, jwksUri: undefined }).exchangeAuthorizationCode(input), OidcProviderUnavailableError);
  await assert.rejects(new ConfiguredOidcProvider(config).exchangeAuthorizationCode({ ...input, redirectUri: 'https://other.test' }), OidcVerificationError);
});
