import { randomUUID } from 'node:crypto';
import { PatientCommandError } from './patient-create-operation-contract.ts';

import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/postgres-patient-repository.ts';
import type {
  Patient,
  PatientCreate,
} from '../../../libs/patient/domain/src/index.ts';
import { buildAuditEvent } from '../../../libs/platform/audit/src/index.ts';
import type {
  TransactionalDatabase,
} from '../../../libs/platform/database/src/index.ts';
import {
  PostgresOperationStore,
  type AdmittedOperation,
  type OperationRecord,
} from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';

export interface PatientCreateSettlementInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly sessionId?: string | null;
  readonly requestId: string;
  readonly correlationId: string;
  readonly operation: AdmittedOperation;
  readonly patient: PatientCreate;
}

export interface PatientCreateSettlementResult {
  readonly patient: Patient;
  readonly operation: OperationRecord;
  readonly auditEventId: string;
}

export class PatientCreateSettlementError extends Error {
  public readonly code:
    | 'INVALID_OPERATION_CONTEXT'
    | 'AUDIT_APPEND_CONFLICT';

  public constructor(code: PatientCreateSettlementError['code']) {
    super(code);
    this.name = 'PatientCreateSettlementError';
    this.code = code;
  }
}

/**
 * Settles an already-admitted P02 operation.
 *
 * The PROCESSING operation must have been durably admitted before this call.
 * Patient state, mandatory audit, operation resource reference and SUCCEEDED
 * result are then committed by one PostgreSQL transaction.
 */
export async function settlePatientCreate(
  database: TransactionalDatabase,
  input: PatientCreateSettlementInput,
): Promise<PatientCreateSettlementResult> {
  if (
    input.operation.tenantId !== input.tenantId ||
    input.operation.actorId !== input.actorId
  ) {
    throw new PatientCreateSettlementError(
      'INVALID_OPERATION_CONTEXT',
    );
  }

  return database.transaction(async (transaction) => {
    // BD-02 explicitly identifies name + DOB as a duplicate signal. Serialize
    // this signal across registration requests; never treat it as a unique key.
    await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify([input.tenantId, input.patient.fullName, input.patient.dateOfBirth])]);
    const candidates = await transaction.query(`SELECT id FROM patients
      WHERE tenant_id=$1 AND full_name=$2 AND date_of_birth=$3::date
        AND medical_record_number <> $4 LIMIT 1`,
    [input.tenantId, input.patient.fullName, input.patient.dateOfBirth, input.patient.medicalRecordNumber]);
    if (candidates.rows.length) {
      // No public bound-confirmation schema exists. Do not leak candidate data
      // or silently perform the duplicate override under an ordinary create.
      throw new PatientCommandError('FEATURE_UNAVAILABLE', 503);
    }
    const patients =
      new PostgresPatientRepository(transaction);
    const audit =
      new PostgresAuditEventRepository(transaction);
    const operations =
      new PostgresOperationStore(transaction);

    const patient = await patients.create({
      tenantId: input.tenantId,
      patient: input.patient,
    });

    const auditEvent = buildAuditEvent({
      id: randomUUID(),
      tenantId: input.tenantId,
      actorId: input.actorId,
      ...(input.sessionId === undefined
        ? {}
        : { sessionId: input.sessionId }),
      action: 'patient.created',
      resourceType: 'PATIENT',
      resourceId: patient.patientId,
      resourceVersion: patient.version,
      result: 'SUCCESS',
      requestId: input.requestId,
      correlationId: input.correlationId,
      operationId: input.operation.operationId,
      metadata: {},
    });

    const auditResult = await audit.append(auditEvent);

    if (auditResult.kind !== 'APPENDED') {
      throw new PatientCreateSettlementError(
        'AUDIT_APPEND_CONFLICT',
      );
    }

    const operation = await operations.complete(
      input.operation,
      {
        resultResourceType: 'PATIENT',
        resultResourceId: patient.patientId,
        resultResourceVersion: patient.version,
        resultHttpStatus: 201,
      },
    );

    return {
      patient,
      operation,
      auditEventId: auditEvent.id,
    };
  });
}
