import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations } from '../../../libs/platform/database/src/index.ts';
import { PostgresPasswordCredentials } from '../../../libs/identity/data-access/src/password-credentials.ts';
import { PostgresSessionRepository, PostgresIdentityContextStore } from '../../../libs/identity/data-access/src/index.ts';
import { PasswordAuthService } from '../../../libs/identity/application/src/password-auth.ts';
import { SessionService } from '../../../libs/identity/application/src/session-service.ts';
import { createPersonaResolver } from './persona.ts';
import { createVioraHttpServer, type HttpServerDependencies } from './http-server.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/index.ts';
import { PostgresIdempotencyStore } from '../../../libs/platform/idempotency/src/index.ts';

test('Run 1 password HTTP, authoritative personas, refresh and revoke on current migrations', { skip: !process.env.DATABASE_URL }, async () => {
  const url = process.env.DATABASE_URL!;
  if (new URL(url).pathname !== '/viora_mobile_test' || process.env.VIORA_DISPOSABLE_DATABASE !== '1') throw new Error('Disposable viora_mobile_test required');
  const migration = createPostgresMigrationDatabase(url);
  try {
    await migration.query('DROP SCHEMA public CASCADE'); await migration.query('CREATE SCHEMA public');
    const files = await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations', import.meta.url)));
    const applied = await runMigrations(migration, files);
    assert.equal(applied.length, files.length);
    assert.equal(applied.at(-1)?.version, '027');
  } finally { await migration.close(); }
  const db = createPostgresDatabase(url);
  const sessions = new SessionService({ sessions: new PostgresSessionRepository(db) });
  const passwords = new PasswordAuthService(new PostgresPasswordCredentials(db), sessions);
  const resolvePersona = createPersonaResolver(db);
  const dependencies: HttpServerDependencies = { passwords, sessions, resolvePersona, identities: new PostgresIdentityContextStore(db),
    patients: new PostgresPatientRepository(db), idempotency: new PostgresIdempotencyStore(db), patientDirectoryCursor: null,
    membershipGrants: { async listPermissions() { return []; } },
    authTransactions: { async createTransaction() { throw new Error('OIDC not configured'); }, async completeSession() { throw new Error('OIDC not configured'); } },
  };
  const server = createVioraHttpServer(dependencies);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const call = async (path: string, body?: unknown, token?: string, workspace?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(workspace ? { 'X-Workspace-ID': workspace } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const input = { email: ' Run1@Example.test ', password: 'synthetic-password-123', displayName: 'Synthetic User' };
    for (const field of ['role','persona','tenantId','workspaceId','issuer']) assert.equal((await call('auth/register', { ...input, [field]: 'forged' })).status, 400);
    assert.equal((await call('auth/register', input)).status, 201);
    assert.equal((await call('auth/register', input)).status, 409);
    const row = (await db.query('SELECT * FROM password_credentials')).rows[0];
    assert.equal(row.email, 'run1@example.test'); assert.notEqual(row.password_hash, input.password);
    const wrong = await call('auth/login', { email: input.email, password: 'incorrect-password' });
    const unknown = await call('auth/login', { email: 'missing@example.test', password: 'incorrect-password' });
    assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.code, unknown.body.error.code); assert.equal(wrong.body.error.message, unknown.body.error.message);
    const login = await call('auth/login', { email: input.email, password: input.password });
    assert.equal(login.status, 200);
    let tokens = login.body.data;
    assert.match(tokens.accessToken, /^viora_access_v1\./);
    const patient = await call('me', undefined, tokens.accessToken);
    assert.equal(patient.status, 200); assert.equal(patient.body.data.persona, 'PATIENT'); assert.equal(patient.body.data.workspace, null);
    assert.deepEqual(patient.body.data.memberships, []);
    assert.equal(patient.body.data.requiresWorkspaceSelection, false);
    assert.equal(patient.body.data.user.id, row.user_id);
    assert.equal(patient.body.data.sessionId, tokens.accessToken.split('.')[1]);
    assert.ok(Date.parse(tokens.refreshExpiresAt) > Date.parse(tokens.accessExpiresAt));
    const tenant = randomUUID(), membership = randomUUID();
    await db.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Synthetic','ACTIVE',now(),now())", [tenant]);
    await db.query("INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'DOCTOR','ACTIVE',now(),now())", [membership,row.user_id,tenant]);
    for (const role of ['DOCTOR','NURSE','RECEPTIONIST','CLINIC_ADMIN']) {
      await db.query('UPDATE memberships SET role=$1 WHERE id=$2', [role,membership]);
      const staffLogin = await call('auth/login', { email: input.email, password: input.password });
      assert.equal((await call('me', undefined, staffLogin.body.data.accessToken)).body.data.persona, role);
    }
    await db.query("UPDATE memberships SET role='UNCLASSIFIED' WHERE id=$1", [membership]);
    assert.equal((await call('me', undefined, tokens.accessToken)).status, 403);
    await db.query("UPDATE memberships SET role='DOCTOR',status='SUSPENDED' WHERE id=$1", [membership]);
    assert.equal((await call('me', undefined, tokens.accessToken)).body.data.persona, 'PATIENT');
    await db.query("UPDATE memberships SET status='ACTIVE' WHERE id=$1", [membership]);
    const other = randomUUID();
    await db.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Other synthetic','ACTIVE',now(),now())", [other]);
    await db.query("INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'NURSE','ACTIVE',now(),now())", [randomUUID(),row.user_id,other]);
    const selection = (await call('me', undefined, tokens.accessToken)).body.data;
    assert.equal(selection.requiresWorkspaceSelection, true); assert.equal(selection.persona, null);
    assert.equal((await call('me', undefined, tokens.accessToken, other)).body.data.persona, 'NURSE');
    const refreshed = await call('auth/refresh', { refreshToken: tokens.refreshToken });
    assert.equal(refreshed.status, 200); tokens = refreshed.body.data;
    assert.equal((await call('me', undefined, tokens.accessToken)).status, 200);
    assert.equal((await call('auth/revoke', {}, tokens.accessToken)).status, 204);
    assert.equal((await call('me', undefined, tokens.accessToken)).status, 401);
    await db.query("UPDATE users SET status='DISABLED' WHERE id=$1", [row.user_id]);
    assert.equal((await call('auth/login', { email: input.email, password: input.password })).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); }
});
