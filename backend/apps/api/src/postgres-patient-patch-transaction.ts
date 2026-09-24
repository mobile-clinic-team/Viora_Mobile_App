import { randomUUID } from 'node:crypto';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/postgres-patient-repository.ts';
import type { Patient, PatientProfileChanges } from '../../../libs/patient/domain/src/index.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { buildAuditEvent } from '../../../libs/platform/audit/src/index.ts';
import { PostgresOperationStore, type AdmittedOperation } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import { PatientCommandError } from './patient-create-operation-contract.ts';

export async function settlePatientPatch(database: TransactionalDatabase, input: {
  tenantId: string; actorId: string; sessionId: string; requestId: string; correlationId: string;
  operation: AdmittedOperation; patientId: string; expectedVersion: bigint; changes: PatientProfileChanges;
  authorize(patient: Patient): Promise<void>;
}) {
  if (input.operation.tenantId !== input.tenantId || input.operation.actorId !== input.actorId) {
    throw new PatientCommandError('FORBIDDEN', 403);
  }
  return database.transaction(async transaction => {
    const patients = new PostgresPatientRepository(transaction);
    const current = await patients.findById({ tenantId: input.tenantId, patientId: input.patientId });
    if (!current) throw new PatientCommandError('RESOURCE_NOT_FOUND', 404);
    await input.authorize(current);
    const patient = await patients.update({ tenantId: input.tenantId, patientId: input.patientId,
      expectedVersion: input.expectedVersion, changes: input.changes });
    if (!patient) throw new PatientCommandError('VERSION_CONFLICT', 412);
    const result = await new PostgresAuditEventRepository(transaction).append(buildAuditEvent({
      id: randomUUID(), tenantId: input.tenantId, actorId: input.actorId, sessionId: input.sessionId,
      requestId: input.requestId, correlationId: input.correlationId, action: 'patient.updated',
      resourceType: 'PATIENT', resourceId: patient.patientId, resourceVersion: patient.version,
      operationId: input.operation.operationId, result: 'SUCCESS', metadata: {},
    }));
    if (result.kind !== 'APPENDED') throw new Error('Mandatory audit failed');
    return new PostgresOperationStore(transaction).complete(input.operation, {
      resultResourceType: 'PATIENT', resultResourceId: patient.patientId,
      resultResourceVersion: patient.version, resultHttpStatus: 200,
    });
  });
}
