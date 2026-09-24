import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createPostgresDatabase,
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
  type TransactionalDatabase,
} from '../../../libs/platform/database/src/index.ts';
import {
  PostgresPatientRepository,
} from '../../../libs/patient/data-access/src/postgres-patient-repository.ts';
import {
  PatientMedicalRecordNumberConflictError,
} from '../../../libs/patient/domain/src/repository-ports.ts';
import type {
  PatientCreate,
} from '../../../libs/patient/domain/src/index.ts';

const connectionString = process.env.DATABASE_URL;

function patient(
  medicalRecordNumber: string,
  fullName: string,
): PatientCreate {
  return {
    userId: null,
    medicalRecordNumber,
    fullName,
    dateOfBirth: '1990-01-01',
    sex: 'UNKNOWN',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    status: 'ACTIVE',
  };
}

test(
  'BD-02 PostgreSQL enforces tenant MRN uniqueness and atomic Patient OCC',
  { skip: !connectionString },
  async () => {
    if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
      throw new Error(
        'Requires VIORA_DISPOSABLE_DATABASE=1 and a disposable test database',
      );
    }

    // Forward migrations only.
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
              const name = `patient_repo_test_${++savepoint}`;
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

          const repository = new PostgresPatientRepository(scoped);
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          const mrn = `BD02-${randomUUID()}`;

          await tx.query(
            `INSERT INTO tenants
              (id, name, status, created_at, updated_at)
             VALUES
              ($1, 'BD-02 Tenant A', 'ACTIVE', now(), now()),
              ($2, 'BD-02 Tenant B', 'ACTIVE', now(), now())`,
            [tenantA, tenantB],
          );

          const first = await repository.create({
            tenantId: tenantA,
            patient: patient(mrn, 'Original Patient'),
          });

          assert.equal(first.version, 1n);
          assert.equal(first.medicalRecordNumber, mrn);

          const otherTenant = await repository.create({
            tenantId: tenantB,
            patient: patient(mrn, 'Other Tenant Patient'),
          });

          assert.equal(otherTenant.medicalRecordNumber, mrn);
          assert.equal(otherTenant.tenantId, tenantB);

          await assert.rejects(
            scoped.transaction(async () =>
              repository.create({
                tenantId: tenantA,
                patient: patient(mrn, 'Duplicate Patient'),
              }),
            ),
            error =>
              error instanceof PatientMedicalRecordNumberConflictError,
          );

          const updated = await repository.update({
            tenantId: tenantA,
            patientId: first.patientId,
            changes: {
              fullName: 'Updated Patient',
            },
            expectedVersion: 1n,
          });

          assert.ok(updated);
          assert.equal(updated.fullName, 'Updated Patient');
          assert.equal(updated.version, 2n);

          const stale = await repository.update({
            tenantId: tenantA,
            patientId: first.patientId,
            changes: {
              fullName: 'Stale Overwrite',
            },
            expectedVersion: 1n,
          });

          assert.equal(stale, null);

          const persisted = await repository.findById({
            tenantId: tenantA,
            patientId: first.patientId,
          });

          assert.ok(persisted);
          assert.equal(persisted.fullName, 'Updated Patient');
          assert.equal(persisted.version, 2n);

          throw rollback;
        }),
        error => error === rollback,
      );
    } finally {
      await database.close();
    }
  },
);