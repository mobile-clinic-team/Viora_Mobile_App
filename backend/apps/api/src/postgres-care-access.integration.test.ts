import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations,
  type TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresCareAccessRepository } from '../../../libs/patient/data-access/src/postgres-care-access-repository.ts';
import type { CareAccessKind } from '../../../libs/patient/domain/src/care-access.ts';

const connectionString = process.env.DATABASE_URL;
test('BD-01 PostgreSQL durable care state, isolation, retained history and atomic audit', { skip: !connectionString }, async () => {
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') throw new Error('Requires VIORA_DISPOSABLE_DATABASE=1 and a disposable test database');
  // Forward migrations only. Never reset a schema or bypass history triggers.
  const migration = createPostgresMigrationDatabase(connectionString!);
  try { await runMigrations(migration, await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations', import.meta.url)))); }
  finally { await migration.close(); }
  const database = createPostgresDatabase(connectionString!);
  const rollback = new Error('owned fixture rollback');
  try {
    await assert.rejects(database.transaction(async tx => {
      let savepoint = 0;
      const scoped: TransactionalDatabase = { ...tx, close: async () => {}, transaction: async work => {
        const name = `care_test_${++savepoint}`;
        await tx.query(`SAVEPOINT ${name}`);
        try { const result = await work(tx); await tx.query(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.query(`ROLLBACK TO SAVEPOINT ${name}`); await tx.query(`RELEASE SAVEPOINT ${name}`); throw error; }
      } };
      const repo = new PostgresCareAccessRepository(scoped);
      const a = randomUUID(), b = randomUUID(), user = randomUUID(), member = randomUUID(), foreignMember = randomUUID();
      const patient = randomUUID(), foreignPatient = randomUUID();
      await tx.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Care A','ACTIVE',now(),now()),($2,'Care B','ACTIVE',now(),now())", [a,b]);
      await tx.query("INSERT INTO users(id,status,created_at,updated_at) VALUES($1,'ACTIVE',now(),now())", [user]);
      for (const [tenantId, membershipId, patientId] of [[a,member,patient],[b,foreignMember,foreignPatient]]) {
        await tx.query("INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'DOCTOR','ACTIVE',now(),now())", [membershipId,user,tenantId]);
        await tx.query("INSERT INTO patients(id,tenant_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at) VALUES($1,$2,$3,'Synthetic','1990-01-01','UNKNOWN','','','','','ACTIVE',now(),now())", [patientId,tenantId,'MRN-' + patientId]);
      }
      const scope = { tenantId: a, patientId: patient, membershipId: member };
      const change = { actorId: user, actorMembershipId: member, requestId: randomUUID(), correlationId: randomUUID() };
      await assert.rejects(repo.create({ ...scope, ...change, kind: 'UNKNOWN' as CareAccessKind }), { code: '23514' });
      await assert.rejects(
        repo.create({ ...scope, ...change, kind: 'NURSE_ASSIGNMENT' }),
        { code: '23514' },
      );
      for (const kind of ['DOCTOR_RELATIONSHIP', 'NURSE_ASSIGNMENT'] as const) {
        await tx.query(
          'UPDATE memberships SET role=$1 WHERE tenant_id=$2 AND id=$3',
          [kind === 'DOCTOR_RELATIONSHIP' ? 'DOCTOR' : 'NURSE', a, member],
        );
        const input = { ...scope, ...change, kind };
        const read = { ...scope, kind, userId: user };
        assert.equal(await repo.hasActive(read), false);
        const id = await repo.create(input);
        assert.equal(await repo.hasActive(read), true);
        if (kind === 'DOCTOR_RELATIONSHIP') {
          await tx.query(
            "UPDATE memberships SET role='NURSE' WHERE tenant_id=$1 AND id=$2",
            [a, member],
          );
          assert.equal(await repo.hasActive(read), false);

          await tx.query(
            "UPDATE memberships SET role='DOCTOR' WHERE tenant_id=$1 AND id=$2",
            [a, member],
          );
          assert.equal(await repo.hasActive(read), true);
        }
        assert.equal(await repo.hasActive({ ...read, tenantId: b }), false);
        assert.equal(await repo.hasActive({ ...read, membershipId: foreignMember }), false);
        assert.equal(await repo.hasActive({ ...read, patientId: foreignPatient }), false);
        assert.equal(await repo.hasActive({ ...read, userId: randomUUID() }), false);
        assert.equal(await repo.hasActive({ ...read, kind: 'UNKNOWN' as CareAccessKind }), false);
        await assert.rejects(repo.create(input), { code: '23505' });
        await assert.rejects(repo.create({ ...input, patientId: foreignPatient }), { code: '23503' });
        await assert.rejects(repo.create({ ...input, membershipId: foreignMember }), { code: '23503' });
        assert.equal(await repo.revoke({ ...input, id, tenantId: b }), false);
        await assert.rejects(repo.revoke({ ...input, id, requestId: '' }), { code: '23514' });
        assert.equal(await repo.hasActive(read), true, 'audit failure rolls back revocation');
        assert.equal(await repo.revoke({ ...input, id }), true);
        assert.equal(await repo.hasActive(read), false);
        assert.equal(await repo.revoke({ ...input, id }), false);
        const history = await repo.history(read);
        assert.equal(history.length, 1);
        assert.equal(history[0]?.id, id);
        assert.ok(history[0]?.created_at);
        assert.ok(history[0]?.revoked_at);
        assert.equal(history[0]?.created_by_membership_id, member);
        assert.equal(history[0]?.revoked_by_membership_id, member);
        assert.equal((await repo.history({ ...read, tenantId: b })).length, 0);
        await assert.rejects(scoped.transaction(t => t.query('DELETE FROM patient_care_access WHERE id=$1', [id])));
        await assert.rejects(scoped.transaction(t => t.query('UPDATE patient_care_access SET revoked_at=NULL,revoked_by_membership_id=NULL WHERE id=$1', [id])));
        await assert.rejects(repo.create({ ...input, requestId: '' }), { code: '23514' });
        assert.equal((await repo.history(read)).length, 1, 'audit failure rolls back creation');
        const newId = await repo.create(input);
        assert.notEqual(newId, id);
        assert.equal((await repo.history(read)).length, 2);
        assert.equal(await repo.hasActive(read), true);
        if (kind === 'DOCTOR_RELATIONSHIP') {
          await tx.query(
            "UPDATE memberships SET role='NURSE' WHERE tenant_id=$1 AND id=$2",
            [a, member],
          );
          assert.equal(await repo.hasActive(read), false);

          await tx.query(
            "UPDATE memberships SET role='DOCTOR' WHERE tenant_id=$1 AND id=$2",
            [a, member],
          );
          assert.equal(await repo.hasActive(read), true);
        }
        const audits = await tx.query('SELECT action,metadata FROM audit_events WHERE tenant_id=$1 AND resource_id=$2 ORDER BY action', [a,id]);
        assert.deepEqual(audits.rows.map(row => row.action), ['patient.care_access.create','patient.care_access.revoke']);
        assert.equal(JSON.stringify(audits.rows).includes('Synthetic'), false);
      }
      await assert.rejects(scoped.transaction(t => t.query('TRUNCATE patient_care_access')));
      await tx.query("UPDATE memberships SET role='DOCTOR' WHERE id=$1", [member]);
      await tx.query("UPDATE memberships SET status='REVOKED' WHERE id=$1", [member]);
      assert.equal(await repo.hasActive({ ...scope, kind: 'DOCTOR_RELATIONSHIP', userId: user }), false);
      throw rollback;
    }), error => error === rollback);
  } finally { await database.close(); }
});
