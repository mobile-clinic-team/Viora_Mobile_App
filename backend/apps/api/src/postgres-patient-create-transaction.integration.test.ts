import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createPostgresDatabase,
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
} from '../../../libs/platform/database/src/index.ts';
import {
  OperationStoreError,
  PostgresOperationStore,
} from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import type {
  PatientCreate,
} from '../../../libs/patient/domain/src/index.ts';

import {
  settlePatientCreate,
} from './postgres-patient-create-transaction.ts';

const connectionString = process.env.DATABASE_URL;

function requireDisposableDatabase(): string {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error(
      'Requires VIORA_DISPOSABLE_DATABASE=1 and viora_mobile_test',
    );
  }

  const databaseName =
    decodeURIComponent(
      new URL(connectionString).pathname.replace(/^\/+/, ''),
    );

  if (databaseName !== 'viora_mobile_test') {
    throw new Error(
      `Refusing integration test against database: ${databaseName}`,
    );
  }

  return connectionString;
}

function patient(
  medicalRecordNumber: string,
): PatientCreate {
  return {
    userId: null,
    medicalRecordNumber,
    fullName: 'Atomic Synthetic Patient ' + medicalRecordNumber,
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
  'P02 Patient create atomically settles patient, audit and operation evidence',
  { skip: !connectionString },
  async () => {
    const url = requireDisposableDatabase();

    const migrationDatabase =
      createPostgresMigrationDatabase(url);

    try {
      await migrationDatabase.query(
        'DROP SCHEMA public CASCADE',
      );

      await migrationDatabase.query(
        'CREATE SCHEMA public',
      );

      const migrationDirectory =
        fileURLToPath(
          new URL(
            '../../../database/migrations',
            import.meta.url,
          ),
        );

      await runMigrations(
        migrationDatabase,
        await loadMigrationFiles(
          migrationDirectory,
        ),
      );
    } finally {
      await migrationDatabase.close();
    }

    const database =
      createPostgresDatabase(url);

    const tenantId = randomUUID();
    const actorId = randomUUID();

    try {
      await database.query(
        `INSERT INTO tenants
          (id, name, status, created_at, updated_at)
         VALUES
          ($1, 'P02 atomic test', 'ACTIVE',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [tenantId],
      );

      await database.query(
        `INSERT INTO users
          (id, status, created_at, updated_at)
         VALUES
          ($1, 'ACTIVE',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [actorId],
      );

      const operations =
        new PostgresOperationStore(database);

      // --------------------------------------------------
      // Case 1: successful atomic settlement
      // --------------------------------------------------

      const successNow = new Date();

      const successIntent = {
        tenantId,
        actorId,
        idempotencyKey: randomUUID(),
        requestFingerprint: 'a'.repeat(64),
        operationCreatedAt: successNow,
      };

      const successAdmission =
        await operations.admit(
          successIntent,
          successNow,
        );

      assert.equal(
        successAdmission.kind,
        'STARTED',
      );

      const successMrn =
        `A-${randomUUID().slice(0, 8)}`;

      const settled =
        await settlePatientCreate(
          database,
          {
            tenantId,
            actorId,
            requestId: randomUUID(),
            correlationId: randomUUID(),
            operation: successAdmission.record,
            patient: patient(successMrn),
          },
        );

      assert.equal(
        settled.operation.status,
        'SUCCEEDED',
      );

      assert.equal(
        settled.operation.resultResourceId,
        settled.patient.patientId,
      );

      assert.equal(
        settled.operation.resultResourceVersion,
        settled.patient.version,
      );

      assert.equal(
        settled.operation.resultHttpStatus,
        201,
      );

      const patientRow =
        await database.query<{
          id: string;
          version: string;
          medical_record_number: string;
        }>(
          `SELECT
             id,
             version::text AS version,
             medical_record_number
           FROM patients
           WHERE tenant_id = $1
             AND id = $2`,
          [
            tenantId,
            settled.patient.patientId,
          ],
        );

      assert.equal(
        patientRow.rows.length,
        1,
      );

      assert.equal(
        patientRow.rows[0]?.medical_record_number,
        successMrn,
      );

      assert.equal(
        patientRow.rows[0]?.version,
        '1',
      );

      const auditRow =
        await database.query<{
          action: string;
          resource_type: string;
          resource_id: string;
          resource_version: string;
          operation_id: string;
        }>(
          `SELECT
             action,
             resource_type,
             resource_id,
             resource_version::text
               AS resource_version,
             operation_id
           FROM audit_events
           WHERE tenant_id = $1
             AND id = $2`,
          [
            tenantId,
            settled.auditEventId,
          ],
        );

      assert.equal(
        auditRow.rows.length,
        1,
      );

      assert.equal(
        auditRow.rows[0]?.action,
        'patient.created',
      );

      assert.equal(
        auditRow.rows[0]?.resource_type,
        'PATIENT',
      );

      assert.equal(
        auditRow.rows[0]?.resource_id,
        settled.patient.patientId,
      );

      assert.equal(
        auditRow.rows[0]?.resource_version,
        '1',
      );

      assert.equal(
        auditRow.rows[0]?.operation_id,
        successAdmission.record.operationId,
      );

      const resourceRef =
        await database.query<{
          operation_id: string;
          resource_type: string;
          resource_id: string;
          resource_version: string;
        }>(
          `SELECT
             operation_id,
             resource_type,
             resource_id,
             resource_version::text
               AS resource_version
           FROM operation_resource_refs
           WHERE tenant_id = $1
             AND operation_id = $2`,
          [
            tenantId,
            successAdmission.record.operationId,
          ],
        );

      assert.equal(
        resourceRef.rows.length,
        1,
      );

      assert.equal(
        resourceRef.rows[0]?.resource_type,
        'PATIENT',
      );

      assert.equal(
        resourceRef.rows[0]?.resource_id,
        settled.patient.patientId,
      );

      assert.equal(
        resourceRef.rows[0]?.resource_version,
        '1',
      );

      // --------------------------------------------------
      // Case 2: audit persistence fails -> Patient rollback
      // --------------------------------------------------

      const auditFailureNow = new Date();

      const auditFailureIntent = {
        tenantId,
        actorId,
        idempotencyKey: randomUUID(),
        requestFingerprint: 'b'.repeat(64),
        operationCreatedAt: auditFailureNow,
      };

      const auditFailureAdmission =
        await operations.admit(
          auditFailureIntent,
          auditFailureNow,
        );

      assert.equal(
        auditFailureAdmission.kind,
        'STARTED',
      );

      const auditFailureMrn =
        `B-${randomUUID().slice(0, 8)}`;

      await assert.rejects(
        settlePatientCreate(
          database,
          {
            tenantId,
            actorId,
            // Intentionally references no sessions row.
            sessionId: randomUUID(),
            requestId: randomUUID(),
            correlationId: randomUUID(),
            operation:
              auditFailureAdmission.record,
            patient:
              patient(auditFailureMrn),
          },
        ),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23503',
      );

      const patientAfterAuditFailure =
        await database.query<{
          count: string;
        }>(
          `SELECT COUNT(*)::text AS count
           FROM patients
           WHERE tenant_id = $1
             AND medical_record_number = $2`,
          [
            tenantId,
            auditFailureMrn,
          ],
        );

      assert.equal(
        patientAfterAuditFailure.rows[0]?.count,
        '0',
      );

      const auditAfterAuditFailure =
        await database.query<{
          count: string;
        }>(
          `SELECT COUNT(*)::text AS count
           FROM audit_events
           WHERE tenant_id = $1
             AND operation_id = $2`,
          [
            tenantId,
            auditFailureAdmission.record.operationId,
          ],
        );

      assert.equal(
        auditAfterAuditFailure.rows[0]?.count,
        '0',
      );

      const refAfterAuditFailure =
        await database.query<{
          count: string;
        }>(
          `SELECT COUNT(*)::text AS count
           FROM operation_resource_refs
           WHERE tenant_id = $1
             AND operation_id = $2`,
          [
            tenantId,
            auditFailureAdmission.record.operationId,
          ],
        );

      assert.equal(
        refAfterAuditFailure.rows[0]?.count,
        '0',
      );

      const operationAfterAuditFailure =
        await database.query<{
          status: string;
        }>(
          `SELECT status
           FROM operations
           WHERE tenant_id = $1
             AND id = $2`,
          [
            tenantId,
            auditFailureAdmission.record.operationId,
          ],
        );

      assert.equal(
        operationAfterAuditFailure.rows[0]?.status,
        'PROCESSING',
      );

      // --------------------------------------------------
      // Case 3: operation fencing fails after audit write
      // -> both Patient and audit rollback
      // --------------------------------------------------

      const fenceFailureNow = new Date();

      const fenceFailureIntent = {
        tenantId,
        actorId,
        idempotencyKey: randomUUID(),
        requestFingerprint: 'c'.repeat(64),
        operationCreatedAt: fenceFailureNow,
      };

      const fenceFailureAdmission =
        await operations.admit(
          fenceFailureIntent,
          fenceFailureNow,
        );

      assert.equal(
        fenceFailureAdmission.kind,
        'STARTED',
      );

      const fenceFailureMrn =
        `C-${randomUUID().slice(0, 8)}`;

      await assert.rejects(
        settlePatientCreate(
          database,
          {
            tenantId,
            actorId,
            requestId: randomUUID(),
            correlationId: randomUUID(),
            operation: {
              ...fenceFailureAdmission.record,
              requestFingerprint:
                'd'.repeat(64),
            },
            patient:
              patient(fenceFailureMrn),
          },
        ),
        (error: unknown) =>
          error instanceof OperationStoreError &&
          error.code ===
            'OPERATION_NOT_PROCESSING',
      );

      const patientAfterFenceFailure =
        await database.query<{
          count: string;
        }>(
          `SELECT COUNT(*)::text AS count
           FROM patients
           WHERE tenant_id = $1
             AND medical_record_number = $2`,
          [
            tenantId,
            fenceFailureMrn,
          ],
        );

      assert.equal(
        patientAfterFenceFailure.rows[0]?.count,
        '0',
      );

      const auditAfterFenceFailure =
        await database.query<{
          count: string;
        }>(
          `SELECT COUNT(*)::text AS count
           FROM audit_events
           WHERE tenant_id = $1
             AND operation_id = $2`,
          [
            tenantId,
            fenceFailureAdmission.record.operationId,
          ],
        );

      assert.equal(
        auditAfterFenceFailure.rows[0]?.count,
        '0',
      );

      const refAfterFenceFailure =
        await database.query<{
          count: string;
        }>(
          `SELECT COUNT(*)::text AS count
           FROM operation_resource_refs
           WHERE tenant_id = $1
             AND operation_id = $2`,
          [
            tenantId,
            fenceFailureAdmission.record.operationId,
          ],
        );

      assert.equal(
        refAfterFenceFailure.rows[0]?.count,
        '0',
      );

      const operationAfterFenceFailure =
        await database.query<{
          status: string;
        }>(
          `SELECT status
           FROM operations
           WHERE tenant_id = $1
             AND id = $2`,
          [
            tenantId,
            fenceFailureAdmission.record.operationId,
          ],
        );

      assert.equal(
        operationAfterFenceFailure.rows[0]?.status,
        'PROCESSING',
      );
    } finally {
      await database.close();
    }
  },
);