import type { PatientCreate } from '../../../libs/patient/domain/src/index.ts';
import { PatientMedicalRecordNumberConflictError } from '../../../libs/patient/domain/src/repository-ports.ts';
import {
  OperationStoreError, type AdmittedOperation, type OperationRecord,
  type PostgresOperationStore,
} from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import {
  parseOperationIdentity, patientCommandFingerprint, PatientCommandError,
  patientWriteReceipt, type PatientWriteReceipt,
} from './patient-create-operation-contract.ts';

export interface PatientCreateCommandDependencies<T = PatientCreate> {
  operations: Pick<PostgresOperationStore, 'admit' | 'fail'>;
  /** Re-check the current session, workspace, revision, grant and role ceiling. */
  authorize(): Promise<void>;
  /** Re-authorize the persisted result resource before disclosing a receipt. */
  authorizeReplay(operation: OperationRecord): Promise<void>;
  /** Mandatory metadata-only operation.replayed event, before disclosure. */
  auditReplay(operation: OperationRecord): Promise<void>;
  validate(body: unknown): T;
  /** Must atomically commit Patient, patient.created audit and SUCCEEDED result. */
  settle(operation: AdmittedOperation, patient: T): Promise<OperationRecord>;
}

export async function coordinatePatientCreate<T = PatientCreate>(
  dependencies: PatientCreateCommandDependencies<T>,
  input: { tenantId: string; actorId: string; key: unknown; timestamp: unknown; body: unknown },
  now = new Date(),
  command: { method: 'POST' | 'PATCH'; path: string; ifMatch?: unknown } = { method: 'POST', path: '/v1/patients' },
): Promise<{ status: 200 | 201; receipt: PatientWriteReceipt; replayed: boolean }> {
  await dependencies.authorize();
  const identity = parseOperationIdentity(input.key, input.timestamp);
  const intent = { ...identity, tenantId: input.tenantId, actorId: input.actorId,
    requestFingerprint: patientCommandFingerprint(input.body, identity.operationCreatedAt, command.method, command.path, command.ifMatch) };
  let admitted;
  try {
    admitted = await dependencies.operations.admit(intent, now);
  } catch (error) {
    if (error instanceof OperationStoreError) {
      if (error.code === 'OPERATION_EXPIRED') throw new PatientCommandError(error.code, 410);
      if (error.code === 'INVALID_OPERATION') throw new PatientCommandError('INVALID_REQUEST', 400);
    }
    throw error;
  }
  const operation = admitted.record;
  if (admitted.kind === 'CONFLICT') throw new PatientCommandError('IDEMPOTENCY_CONFLICT', 409);
  if (admitted.kind === 'IN_PROGRESS') throw new PatientCommandError('OPERATION_IN_PROGRESS', 409);
  if (admitted.kind === 'REPLAY') {
    await dependencies.authorizeReplay(operation);
    if (now.getTime() >= operation.updatedAt.getTime() + 86_400_000) {
      throw new PatientCommandError('OPERATION_EXPIRED', 410);
    }
    await dependencies.auditReplay(operation);
    if (operation.status === 'FAILED') {
      if (!operation.failureCode || !operation.resultHttpStatus) throw new PatientCommandError('INTERNAL_ERROR', 500);
      const failure = new PatientCommandError(operation.failureCode, operation.resultHttpStatus);
      failure.replayed = true;
      throw failure;
    }
    if (operation.status === 'CLOSED') throw new PatientCommandError('OPERATION_CLOSED', 409);
    const receipt = patientWriteReceipt(operation);
    return { status: operation.resultHttpStatus as 200 | 201, receipt, replayed: true };
  }
  let patient: T;
  try {
    patient = dependencies.validate(input.body);
  } catch (error) {
    // Validation happens after durable admission. Never overwrite an existing result.
    if (error instanceof PatientCommandError) {
      await dependencies.operations.fail(operation, { failureCode: error.code, resultHttpStatus: error.status });
    }
    throw error;
  }
  let settled: OperationRecord;
  try {
    settled = await dependencies.settle(operation, patient);
  } catch (error) {
    // Only a typed uniqueness rejection proves no Patient commit. A connection
    // loss at COMMIT is ambiguous and must remain pending for reconciliation.
    if (error instanceof PatientMedicalRecordNumberConflictError) {
      await dependencies.operations.fail(operation, { failureCode: 'CONFLICT', resultHttpStatus: 409 });
      throw new PatientCommandError('CONFLICT', 409);
    }
    if (error instanceof PatientCommandError) {
      await dependencies.operations.fail(operation, { failureCode: error.code, resultHttpStatus: error.status });
    }
    throw error;
  }
  const receipt = patientWriteReceipt(settled);
  return { status: settled.resultHttpStatus as 200 | 201, receipt, replayed: false };
}
