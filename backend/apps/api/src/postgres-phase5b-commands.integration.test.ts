import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations } from '../../../libs/platform/database/src/index.ts';
import { PostgresOperationStore } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { PostgresIdentityContextStore, PostgresSessionRepository } from '../../../libs/identity/data-access/src/index.ts';
import { PostgresCareAccessRepository } from '../../../libs/patient/data-access/src/postgres-care-access-repository.ts';
import { createPatientCommandRuntime } from './patient-command-runtime.ts';
import { createOperationRuntime } from './operation-runtime.ts';

test('Phase 5B real PostgreSQL command/recovery races, replay, OCC, authorization and rollback', { skip: !process.env.DATABASE_URL }, async () => {
  const url = process.env.DATABASE_URL!;
  let name = '';
  try { name = decodeURIComponent(new URL(url).pathname.slice(1)); } catch { throw new Error('Invalid disposable database configuration'); }
  if (name !== 'viora_mobile_test' || process.env.VIORA_DISPOSABLE_DATABASE !== '1') throw new Error('Requires disposable viora_mobile_test');
  const migrations = createPostgresMigrationDatabase(url);
  try {
    await migrations.query('DROP SCHEMA public CASCADE'); await migrations.query('CREATE SCHEMA public');
    await runMigrations(migrations, await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations', import.meta.url))));
  } finally { await migrations.close(); }
  const database = createPostgresDatabase(url);
  const tenantId = randomUUID(), actorId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
  try {
    await database.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Synthetic','ACTIVE',now(),now())", [tenantId]);
    await database.query("INSERT INTO users(id,status,created_at,updated_at) VALUES($1,'ACTIVE',now(),now())", [actorId]);
    const identityIssuer = 'https://issuer.example.test', identitySubject = 'synthetic';
    await database.query('INSERT INTO identity_subjects(issuer,subject,user_id,created_at) VALUES($1,$2,$3,now())',
      [identityIssuer, identitySubject, actorId]);
    await database.query(`INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at)
      VALUES($1,$2,$3,'CLINIC_ADMIN','ACTIVE',now(),now())`, [membershipId, actorId, tenantId]);
    const permissions = new Set(['patient.read', 'patient.create', 'patient.update']);
    for (const permission of permissions) {
      await database.query(`INSERT INTO membership_grants(id,tenant_id,membership_id,permission,created_at)
        VALUES($1,$2,$3,$4,now())`, [randomUUID(), tenantId, membershipId, permission]);
    }
    // Follow the identity integration fixture: persist the identity first, then
    // use the real repository to create a bound session and refresh family.
    const now = new Date();
    const sessions = new PostgresSessionRepository(database);
    await sessions.create({ sessionId, userId: actorId, identityIssuer, identitySubject,
      accessTokenHash: '11'.repeat(32), refreshTokenHash: '22'.repeat(32),
      familyId: randomUUID(), refreshTokenId: randomUUID(), createdAt: now.toISOString(),
      accessExpiresAt: new Date(now.getTime() + 600_000).toISOString(),
      expiresAt: new Date(now.getTime() + 28_800_000).toISOString() });
    const session = await sessions.findActiveAccessSession({ sessionId,
      presentedAccessTokenHash: '11'.repeat(32), now: now.toISOString() });
    assert.ok(session);
    assert.equal(session.userId, actorId);
    assert.equal(session.identityIssuer, identityIssuer);
    assert.equal(session.identitySubject, identitySubject);
    const [membership] = await new PostgresIdentityContextStore(database).findMembershipsByUser(session.userId);
    assert.ok(membership);
    assert.equal(membership.id, membershipId);
    assert.equal(membership.tenantId, tenantId);
    assert.equal(membership.status, 'ACTIVE');
    const context = createAuthenticatedRequestContext({ requestId: randomUUID(), correlationId: randomUUID(),
      userId: session.userId, subject: session.identitySubject, tenantId: membership.tenantId,
      membershipId: membership.id, permissionRevision: membership.permissionRevision, roles: [membership.role] });
    const careAccess = new PostgresCareAccessRepository(database);
    const command = createPatientCommandRuntime(database, careAccess);
    const recovery = createOperationRuntime(database, careAccess, '12'.repeat(32));
    const base = { context, sessionId: session.sessionId, permissions };
    const input = { ...base, key: randomUUID(), timestamp: new Date().toISOString(), body: {
      medicalRecordNumber: 'SYNTHETIC-1', fullName: 'Synthetic Patient', dateOfBirth: '1990-01-01', sex: 'UNKNOWN', phone: null, email: null, address: null, emergencyContact: null,
    } };
    const first = await command(input);
    assert.equal(first.receipt.operationId, input.key);
    const repeat = await command(input);
    assert.deepEqual(repeat.receipt, first.receipt); assert.equal(repeat.replayed, true);
    const patientId = first.receipt.primary.id;
    const patch = { ...base, key: randomUUID(), timestamp: new Date().toISOString(), patientId, ifMatch: first.receipt.primary.versionToken, body: { phone: '123' } };
    const updated = await command(patch);
    assert.equal(updated.status, 200); assert.equal(updated.receipt.primary.versionToken, '"2"');
    assert.deepEqual((await command(patch)).receipt, updated.receipt);
    const stale = { ...patch, key: randomUUID(), body: { phone: '456' } };
    await assert.rejects(command(stale), { code: 'VERSION_CONFLICT', status: 412 });
    await assert.rejects(command(stale), { code: 'VERSION_CONFLICT', status: 412, replayed: true });
    await assert.rejects(command({ ...patch, body: { phone: '789' } }), { code: 'IDEMPOTENCY_CONFLICT' });
    await assert.rejects(command({ ...input, permissions: new Set() }), { code: 'FORBIDDEN' });
    await assert.rejects(command({ ...input, key: randomUUID(), body: { ...input.body, medicalRecordNumber: 'SYNTHETIC-2' } }), { code: 'FEATURE_UNAVAILABLE' });
    const recovered = await recovery({ ...base, method: 'GET', url: new URL('https://example.test/v1/operations/' + input.key) });
    assert.equal((recovered.data as { state: string }).state, 'SUCCEEDED');
    const missing = randomUUID();
    await assert.rejects(recovery({ ...base, method: 'GET', url: new URL('https://example.test/v1/operations/' + missing) }), { code: 'OPERATION_NOT_FOUND' });
    await recovery({ ...base, method: 'POST', url: new URL('https://example.test/v1/operations/' + missing + '/close'), timestamp: input.timestamp, body: {} });
    await assert.rejects(command({ ...input, key: missing }), { code: 'OPERATION_CLOSED' });
    const store = new PostgresOperationStore(database);
    for (let index = 0; index < 8; index++) {
      const identity = { tenantId, actorId, idempotencyKey: randomUUID(), operationCreatedAt: new Date() };
      const [admitted, closed] = await Promise.all([
        store.admit({ ...identity, requestFingerprint: 'a'.repeat(64) }),
        store.close(identity),
      ]);
      assert.equal(admitted.record.operationId, closed.operationId);
      assert.ok((admitted.kind === 'STARTED' && closed.status === 'PROCESSING') || (admitted.kind === 'REPLAY' && closed.status === 'CLOSED'));
    }
    // Audit failure rolls back domain + receipt; admission remains pending.
    await database.query("CREATE FUNCTION reject_patient_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='patient.updated' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await database.query('CREATE TRIGGER reject_patient_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_patient_audit()');
    const rejected = { ...patch, key: randomUUID(), ifMatch: '"2"', body: { phone: '999' } };
    await assert.rejects(command(rejected));
    await assert.rejects(command(rejected), { code: 'OPERATION_IN_PROGRESS' });
    const row = await database.query('SELECT version::text,phone FROM patients WHERE id=$1', [patientId]);
    assert.equal(row.rows[0].version, '2'); assert.equal(row.rows[0].phone, '123');
    const audits = await database.query("SELECT action,count(*)::text AS count FROM audit_events WHERE action IN ('patient.created','patient.updated') GROUP BY action");
    assert.deepEqual(Object.fromEntries(audits.rows.map(row => [row.action, row.count])), { 'patient.created': '1', 'patient.updated': '1' });
    const auditBinding = await database.query('SELECT DISTINCT tenant_id,actor_id,session_id FROM audit_events');
    assert.deepEqual(auditBinding.rows, [{ tenant_id: tenantId, actor_id: actorId, session_id: sessionId }]);
    const stored = await database.query('SELECT request_fingerprint,failure_code,result_resource_id FROM operations');
    assert.equal(JSON.stringify(stored.rows).includes('Synthetic Patient'), false);
  } finally { await database.close(); }
});
