import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordAuthService } from './password-auth.ts';
import { SessionService } from './session-service.ts';
import type { PasswordCredential } from '../../domain/src/password-credentials.ts';
import type { CreateSessionInput } from '../../domain/src/session-repository.ts';

test('password registration validates input, normalizes identity, hashes secrets and reuses SessionService', async () => {
  let credential: PasswordCredential | null = null;
  let created: CreateSessionInput | undefined;
  const sessions = new SessionService({ sessions: {
    async create(value) { created = value; },
    async findActiveAccessSession() { return null; }, async findRefreshSession() { return null; },
    async rotateRefreshToken() { return { kind: 'INVALID' }; }, async revokeSession() { return false; },
  } });
  const service = new PasswordAuthService({
    async create(value) {
      assert.equal(value.email, 'person@example.test');
      assert.equal(value.displayName, 'Person');
      assert.match(value.passwordHash, /^scrypt\$/);
      assert.ok(!value.passwordHash.includes('long-password'));
      if (credential) return false;
      credential = { userId: '00000000-0000-0000-0000-000000000001', passwordHash: value.passwordHash, status: 'ACTIVE' };
      return true;
    },
    async find(email) { return email === 'person@example.test' ? credential : null; },
  }, sessions);
  const registration = { email: ' Person@Example.test ', password: 'long-password-123', displayName: ' Person ' };
  for (const patch of [{ email: 'invalid' }, { password: 'short' }, { password: 'x'.repeat(257) },
    { password: 'long-password\0' }, { displayName: '' }, ...['role','tenantId','persona','workspaceId','membership','permissions','actorId','patientId','userId','issuer','extra'].map(key => ({ [key]: 'forged' }))]) {
    await assert.rejects(service.register({ ...registration, ...patch }), { code: 'VALIDATION_ERROR' });
  }
  assert.deepEqual(await service.register(registration), { registered: true });
  await assert.rejects(service.register(registration), { code: 'DUPLICATE_IDENTITY' });
  const tokens = await service.login({ email: registration.email, password: registration.password });
  assert.match(tokens.accessToken, /^viora_access_v1\./);
  assert.match(tokens.refreshToken, /^viora_refresh_v1\./);
  assert.equal(created?.identityIssuer, 'urn:viora:password');
  for (const email of ['person@example.test','unknown@example.test']) {
    await assert.rejects(service.login({ email, password: 'incorrect-password' }), { code: 'INVALID_CREDENTIALS' });
  }
  credential!.status = 'INACTIVE';
  await assert.rejects(service.login({ email: registration.email, password: registration.password }), { code: 'INVALID_CREDENTIALS' });
});
