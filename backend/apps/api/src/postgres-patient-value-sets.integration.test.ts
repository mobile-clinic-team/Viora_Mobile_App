import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createPostgresDatabase,
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
  type DatabaseSession,
  type TransactionalDatabase,
} from '../../../libs/platform/database/src/index.ts';

const connectionString = process.env.DATABASE_URL;

test(
  'BD-02 PostgreSQL enforces canonical Patient sex and status value sets',
  { skip: !connectionString },
  async () => {
    if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
      throw new Error(
        'Requires VIORA_DISPOSABLE_DATABASE=1 and a disposable test database',
      );
    }

    // Forward migrations only. Never reset a non-disposable application schema.
    const migration = createPostgresMigrationDatabase(connectionString!);
    try {
      await runMigrations(
        migration,
        await loadMigrationFiles(
          fileURLToPath(
            new URL('../../../database/migrations', import.meta.url),
          ),
        ),
      );
    } finally {
      await migration.close();
    }

    const database = createPostgresDatabase(connectionString!);
    const rollback = new Error('owned fixture rollback');

    try {
      await assert.rejects(
        database.transaction(async tx => {
          let savepoint = 0;

          const scoped: TransactionalDatabase = {
            ...tx,
            close: async () => {},
            transaction: async work => {
              const name = `patient_value_set_test_${++savepoint}`;
              await tx.query(`SAVEPOINT ${name}`);

              try {
                const result = await work(tx);
                await tx.query(`RELEASE SAVEPOINT ${name}`);
                return result;
              } catch (error) {
                await tx.query(`ROLLBACK TO SAVEPOINT ${name}`);
                await tx.query(`RELEASE SAVEPOINT ${name}`);
                throw error;
              }
            },
          };

          const tenantId = randomUUID();

          await tx.query(
            `INSERT INTO tenants
              (id, name, status, created_at, updated_at)
             VALUES
              ($1, 'BD-02 Patient Value Sets', 'ACTIVE', now(), now())`,
            [tenantId],
          );

          const insertPatient = (
            databaseSession: DatabaseSession,
            sex: string,
            status: string,
            suffix: string,
          ) =>
            databaseSession.query(
              `INSERT INTO patients
                (
                  id,
                  tenant_id,
                  medical_record_number,
                  full_name,
                  date_of_birth,
                  sex,
                  phone,
                  email,
                  address,
                  emergency_contact,
                  status,
                  created_at,
                  updated_at
                )
               VALUES
                (
                  $1,
                  $2,
                  $3,
                  'Synthetic Patient',
                  '1990-01-01',
                  $4,
                  '',
                  '',
                  '',
                  '',
                  $5,
                  now(),
                  now()
                )`,
              [
                randomUUID(),
                tenantId,
                `BD02-${suffix}-${randomUUID()}`,
                sex,
                status,
              ],
            );

          await scoped.transaction(session =>
            insertPatient(session, 'UNKNOWN', 'ACTIVE', 'unknown-active'),
          );

          await scoped.transaction(session =>
            insertPatient(session, 'OTHER', 'INACTIVE', 'other-inactive'),
          );

          await assert.rejects(
            scoped.transaction(session =>
              insertPatient(session, 'UNSPECIFIED', 'ACTIVE', 'invalid-sex'),
            ),
            { code: '23514' },
          );

          await assert.rejects(
            scoped.transaction(session =>
              insertPatient(session, 'UNKNOWN', 'ARCHIVED', 'invalid-status'),
            ),
            { code: '23514' },
          );

          const rows = await tx.query<{
            sex: string;
            status: string;
          }>(
            `SELECT sex, status
             FROM patients
             WHERE tenant_id = $1
             ORDER BY medical_record_number`,
            [tenantId],
          );

          assert.deepEqual(
            rows.rows
              .map(row => [row.sex, row.status])
              .sort((a, b) => a.join('|').localeCompare(b.join('|'))),
            [
              ['OTHER', 'INACTIVE'],
              ['UNKNOWN', 'ACTIVE'],
            ],
          );

          throw rollback;
        }),
        error => error === rollback,
      );
    } finally {
      await database.close();
    }
  },
);