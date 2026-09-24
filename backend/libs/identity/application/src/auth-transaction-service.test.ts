import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import type { AuthTransaction, AuthTransactionRepository } from '../../domain/src/auth-transaction.ts';
import { AuthTransactionService } from './auth-transaction-service.ts';
import { NodeAuthTransactionSecretProtector } from './auth-transaction-protector.ts';
import { ConfiguredOidcProvider, StaticOidcProviderRegistry, OidcProviderUnavailableError } from './oidc-provider.ts';
import type { OidcProvider } from './oidc-provider.ts';

function fixture(options: { user?: 'ACTIVE' | 'DISABLED' | 'MISSING'; failure?: boolean } = {}) {
  const rows = new Map<string, AuthTransaction>();
  const repository: AuthTransactionRepository = {
    async create(input) { rows.set(input.transactionId, { ...input, status: 'PENDING', consumedAt: null }); },
    async findById(id) { return rows.get(id) ?? null; },
    async findPendingById(id) { const row = rows.get(id); return row?.status === 'PENDING' ? row : null; },
    async claimForExchange(input) {
      const row = rows.get(input.transactionId);
      if (!row || row.status !== 'PENDING' || row.stateHash !== input.stateHash || row.expiresAt <= input.now) return null;
      const claimed = { ...row, status: 'EXCHANGING' as const };
      rows.set(input.transactionId, claimed); return claimed;
    },
    async completeAtomically(input) {
      const row = rows.get(input.transactionId);
      if (!row || row.status !== 'EXCHANGING') return false;
      rows.set(input.transactionId, { ...row, status: input.status, consumedAt: input.completedAt }); return true;
    },
    async releaseExchange() { throw new Error('must never release an exchange'); },
    async expire(id) { const row = rows.get(id); if (!row) return false; rows.set(id, { ...row, status: 'EXPIRED' }); return true; },
  };
  const protector = new NodeAuthTransactionSecretProtector(randomBytes(32));
  const config = { key: 'google', issuer: 'https://accounts.google.com', clientId: 'test-client',
    authorizationEndpoint: 'https://accounts.google.com/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token',
    redirectUri: 'https://app.example.test/callback', scopes: ['openid', 'email'] };
  const urlProvider = new ConfiguredOidcProvider(config);
  let count = 0;
  const provider: OidcProvider = {
    configuration: config,
    createAuthorizationUrl: input => urlProvider.createAuthorizationUrl(input),
    async exchangeAuthorizationCode() {
      if (options.failure) throw new OidcProviderUnavailableError();
      return { issuer: config.issuer, subject: 'external-subject', audience: config.clientId, nonce: 'test' };
    },
    verifyIdentity: claims => ({ issuer: claims.issuer, subject: claims.subject }),
  };
  const dependencies = { transactions: repository, protector, providers: new StaticOidcProviderRegistry(provider),
    identities: {
      async findUserBySubject(subject: { issuer: string; subject: string }) {
        assert.deepEqual(subject, { issuer: config.issuer, subject: 'external-subject' });
        return options.user === 'MISSING' ? null : { id: '00000000-0000-0000-0000-000000000001', status: options.user ?? 'ACTIVE', subject };
      },
      async findMembershipsByUser() { return []; },
    },
    sessions: { async createSession(input: { userId: string }) {
      count++; assert.equal(input.userId, '00000000-0000-0000-0000-000000000001');
      return { accessToken: 'test-access', refreshToken: 'test-refresh', tokenType: 'Bearer' as const,
        accessExpiresAt: new Date().toISOString(), refreshExpiresAt: new Date().toISOString(),
        sessionId: '00000000-0000-0000-0000-000000000002' };
    } },
  };
  return { service: new AuthTransactionService(dependencies), dependencies, rows, protector, count: () => count };
}

test('transaction creates unique secrets, hashed state, encrypted recoverable nonce/verifier, S256 and five minute TTL', async () => {
  const f = fixture();
  const first = await f.service.createTransaction();
  const second = await f.service.createTransaction();
  const a = f.rows.get(first.transactionId)!;
  const b = f.rows.get(second.transactionId)!;
  const verifier = f.protector.unprotect(a.pkceVerifierCiphertext);
  assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.equal(a.stateHash, createHash('sha256').update(first.state).digest('hex'));
  assert.equal(a.codeChallenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(first.state, second.state);
  assert.notEqual(f.protector.unprotect(a.nonceCiphertext), f.protector.unprotect(b.nonceCiphertext));
  assert.notEqual(verifier, f.protector.unprotect(b.pkceVerifierCiphertext));
  assert.equal(Date.parse(a.expiresAt) - Date.parse(a.createdAt), 300000);
  const url = new URL(first.authorizationUrl);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('nonce'), f.protector.unprotect(a.nonceCiphertext));
  assert.equal(url.searchParams.get('state'), first.state);
  assert.equal(url.searchParams.get('redirect_uri'), a.redirectUri);
  assert.equal(JSON.stringify(first).includes(verifier), false);
  assert.deepEqual(Object.keys(first).sort(), ['authorizationUrl', 'expiresAt', 'state', 'transactionId']);
});

test('wrong state and expired transactions do not create sessions', async () => {
  const f = fixture(); const t = await f.service.createTransaction();
  await assert.rejects(f.service.completeSession({ ...t, code: 'code', state: 'wrong' }), { code: 'INVALID_AUTH_TRANSACTION' });
  await assert.rejects(f.service.completeSession({ ...t, code: 'code', now: new Date(t.expiresAt) }), { code: 'AUTH_TRANSACTION_EXPIRED' });
  assert.equal(f.count(), 0);
});

for (const field of ['pkceVerifierCiphertext', 'nonceCiphertext', 'codeChallenge', 'nonceHash', 'redirectUri'] as const) {
  test(`transaction tampering with ${field} is terminal`, async () => {
    const f = fixture(); const t = await f.service.createTransaction();
    f.rows.set(t.transactionId, { ...f.rows.get(t.transactionId)!, [field]: 'tampered' });
    await assert.rejects(f.service.completeSession({ ...t, code: 'code' }), { code: 'OIDC_VERIFICATION_FAILED' });
    assert.equal(f.rows.get(t.transactionId)?.status, 'REJECTED'); assert.equal(f.count(), 0);
  });
}

test('concurrent completion creates only one session and blocks replay', async () => {
  const f = fixture(); const t = await f.service.createTransaction();
  const results = await Promise.allSettled([1, 2].map(() => f.service.completeSession({ ...t, code: 'code' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.count(), 1); assert.equal(f.rows.get(t.transactionId)?.status, 'CONSUMED');
  await assert.rejects(f.service.completeSession({ ...t, code: 'code' }), { code: 'AUTH_TRANSACTION_REPLAY' });
});

for (const user of ['DISABLED', 'MISSING'] as const) {
  test(`${user} identity cannot create a session`, async () => {
    const f = fixture({ user }); const t = await f.service.createTransaction();
    await assert.rejects(f.service.completeSession({ ...t, code: 'code' }), { code: 'IDENTITY_NOT_PROVISIONED' });
    assert.equal(f.count(), 0);
  });
}

test('provider failure after claim is terminal, including unavailable/timeout', async () => {
  const f = fixture({ failure: true }); const t = await f.service.createTransaction();
  await assert.rejects(f.service.completeSession({ ...t, code: 'code' }), { code: 'AUTH_PROVIDER_UNAVAILABLE' });
  assert.equal(f.rows.get(t.transactionId)?.status, 'REJECTED');
  await assert.rejects(f.service.completeSession({ ...t, code: 'code' }), { code: 'AUTH_TRANSACTION_REPLAY' });
});

test('client userId cannot override verified identity', async () => {
  const f = fixture(); const t = await f.service.createTransaction();
  const input = { ...t, code: 'code', userId: 'attacker', role: 'SUPER_ADMIN' };
  await f.service.completeSession(input); assert.equal(f.count(), 1);
});

test('unconfigured provider/key and invalid provider fail closed', async () => {
  const f = fixture();
  await assert.rejects(f.service.createTransaction({ providerKey: 'other' }), { code: 'INVALID_AUTH_PROVIDER' });
  await assert.rejects(new AuthTransactionService({ ...f.dependencies, protector: null }).createTransaction(), { code: 'AUTH_PROVIDER_UNAVAILABLE' });
  await assert.rejects(new AuthTransactionService({ ...f.dependencies, providers: new StaticOidcProviderRegistry(null) }).createTransaction(), { code: 'AUTH_PROVIDER_UNAVAILABLE' });
});
