import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresMigrationDatabase, loadMigrationFiles, runMigrations } from './index.ts';

const connectionString = process.env.DATABASE_URL;
const uuid = (number: number) => `00000000-0000-0000-0000-${number.toString().padStart(12, '0')}`;

async function withDatabase<T>(callback: (database: ReturnType<typeof createPostgresMigrationDatabase>) => Promise<T>): Promise<T> {
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error('PostgreSQL tests reset public; set VIORA_DISPOSABLE_DATABASE=1 only for a disposable test database');
  }
  const database = createPostgresMigrationDatabase(connectionString!);
  try {
    await database.query('DROP SCHEMA public CASCADE');
    await database.query('CREATE SCHEMA public');
    const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../database/migrations');
    await runMigrations(database, await loadMigrationFiles(directory));
    return await callback(database);
  } finally {
    await database.close();
  }
}

async function insertIdentity(database: ReturnType<typeof createPostgresMigrationDatabase>) {
  const tenantA = uuid(1);
  const tenantB = uuid(2);
  const userA = uuid(11);
  const userB = uuid(12);
  await database.query(`INSERT INTO tenants (id, name, status, created_at, updated_at)
    VALUES ($1, 'A', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ($2, 'B', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [tenantA, tenantB]);
  await database.query(`INSERT INTO users (id, email, status, created_at, updated_at)
    VALUES ($1, 'a@example.test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ($2, 'b@example.test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [userA, userB]);
  await database.query(`INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at)
    VALUES ($1, $2, $3, 'STAFF', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [uuid(21), userA, tenantA]);
  return { tenantA, tenantB, userA, userB };
}

test('Phase 4B PostgreSQL constraints reject cross-workspace links and duplicate identities', { skip: !connectionString }, async () => {
  await withDatabase(async (database) => {
    const { tenantA, tenantB, userA } = await insertIdentity(database);
    await assert.rejects(
      database.query(`INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'STAFF', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [uuid(22), userA, tenantA]),
      /duplicate key value violates unique constraint/,
    );

    await database.query(`INSERT INTO patients
      (id, tenant_id, medical_record_number, full_name, date_of_birth, sex, phone, email, address, emergency_contact, status, created_at, updated_at)
      VALUES ($1, $2, 'A-1', 'Patient A', '1990-01-01', 'UNKNOWN', '1', 'a@x.test', 'A', 'A', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [uuid(31), tenantA]);
    await database.query(`INSERT INTO patients
      (id, tenant_id, medical_record_number, full_name, date_of_birth, sex, phone, email, address, emergency_contact, status, created_at, updated_at)
      VALUES ($1, $2, 'B-1', 'Patient B', '1990-01-01', 'UNKNOWN', '2', 'b@x.test', 'B', 'B', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [uuid(32), tenantB]);
    await assert.rejects(
      database.query(`INSERT INTO appointments
        (id, tenant_id, location_id, patient_id, doctor_id, start_time, end_time, status, reason, notes, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 'PENDING', 'x', 'x', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuid(41), tenantA, uuid(999), uuid(32), uuid(998), userA]),
      /violates foreign key constraint/,
    );
  });
});

test('Phase 4B PostgreSQL operation, clinical-version and AI handoff uniqueness constraints are present', { skip: !connectionString }, async () => {
  await withDatabase(async (database) => {
    const constraints = await database.query<{ constraint_name: string }>(`SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND constraint_name IN (
        'operations_actor_key', 'encounters_appointment_key', 'medical_records_encounter_key',
        'medical_record_versions_record_version_key', 'ai_handoffs_one_per_draft_key',
        'ai_handoffs_one_per_operation_key')
      ORDER BY constraint_name`);
    assert.deepEqual(constraints.rows.map((row) => row.constraint_name), [
      'ai_handoffs_one_per_draft_key',
      'ai_handoffs_one_per_operation_key',
      'encounters_appointment_key',
      'medical_record_versions_record_version_key',
      'medical_records_encounter_key',
      'operations_actor_key',
    ]);

    const indexes = await database.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'patients_workspace_lookup_idx', 'appointments_workspace_time_idx',
        'operations_actor_status_idx', 'audit_events_tenant_time_idx', 'ai_drafts_target_status_idx')
      ORDER BY indexname`);
    assert.equal(indexes.rows.length, 5);
  });
});
