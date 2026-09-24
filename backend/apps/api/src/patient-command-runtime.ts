import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresOperationStore } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/postgres-patient-repository.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { buildAuditEventInput, buildAuditEvent } from '../../../libs/platform/audit/src/index.ts';
import type { CareAccessReader } from '../../../libs/patient/domain/src/care-access.ts';
import { coordinatePatientCreate } from './patient-create-coordinator.ts';
import { PatientCommandError } from './patient-create-operation-contract.ts';
import { validatePatientCreate, validatePatientPatch, patientExpectedVersion } from './patient-command-validation.ts';
import { authorizePatientCommand } from './patient-command-authorization.ts';
import { createPatientAuthorization } from './patient-authorization.ts';
import { settlePatientCreate } from './postgres-patient-create-transaction.ts';
import { settlePatientPatch } from './postgres-patient-patch-transaction.ts';

export interface PatientCommandRequest {
  context: RequestContext; sessionId: string; permissions: ReadonlySet<string>;
  body: unknown; key: unknown; timestamp: unknown; ifMatch?: unknown; patientId?: string;
}

export function createPatientCommandRuntime(database: TransactionalDatabase, careAccess: CareAccessReader) {
  const patients = new PostgresPatientRepository(database);
  const operations = new PostgresOperationStore(database);
  return async (request: PatientCommandRequest) => {
    const { context, permissions, sessionId, patientId } = request;
    if (!context.tenant || !context.actor) throw new PatientCommandError('FORBIDDEN', 403);
    const tenantId = context.tenant.tenantId;
    const actorId = context.actor.userId;
    const action = patientId === undefined ? 'patient.create' : 'patient.update';
    const authorize = async () => {
      const patient = patientId === undefined ? undefined : await patients.findById({ tenantId, patientId });
      if (patient === null) throw new PatientCommandError('RESOURCE_NOT_FOUND', 404);
      await authorizePatientCommand(context, permissions, action, careAccess, patient);
    };
    const shared = {
      operations, authorize,
      async authorizeReplay(operation: Parameters<typeof operations.complete>[0] & { resultResourceId: string | null }) {
        await authorize();
        if (operation.resultResourceId) {
          const patient = await patients.findById({ tenantId, patientId: operation.resultResourceId });
          if (!patient) throw new PatientCommandError('RESOURCE_NOT_FOUND', 404);
          if (!await createPatientAuthorization(permissions, careAccess).allows({ action: 'patient.read', context, patient })) {
            throw new PatientCommandError('FORBIDDEN', 403);
          }
        }
      },
      async auditReplay(operation: Parameters<typeof operations.complete>[0]) {
        const result = await new PostgresAuditEventRepository(database).append(buildAuditEvent(buildAuditEventInput(context, {
          id: randomUUID(), sessionId, action: 'operation.replayed', resourceType: 'OPERATION',
          resourceId: operation.operationId, operationId: operation.operationId, result: 'SUCCESS', metadata: {},
        })));
        if (result.kind !== 'APPENDED') throw new PatientCommandError('AUDIT_UNAVAILABLE', 503);
      },
    };
    const input = { ...request, tenantId, actorId };
    if (patientId === undefined) return coordinatePatientCreate({
      ...shared, validate: validatePatientCreate,
      settle: async (operation, patient) => (await settlePatientCreate(database, {
        tenantId, actorId, sessionId, requestId: context.requestId, correlationId: context.correlationId, operation, patient,
      })).operation,
    }, input);
    return coordinatePatientCreate({
      ...shared, validate: (body: unknown) => ({ changes: validatePatientPatch(body), expectedVersion: patientExpectedVersion(request.ifMatch) }),
      settle: (operation, parsed) => settlePatientPatch(database, {
        tenantId, actorId, sessionId, requestId: context.requestId, correlationId: context.correlationId,
        operation, patientId, ...parsed,
        authorize: patient => authorizePatientCommand(context, permissions, action, careAccess, patient),
      }),
    }, input, new Date(), { method: 'PATCH', path: `/v1/patients/${patientId}`, ifMatch: request.ifMatch });
  };
}
