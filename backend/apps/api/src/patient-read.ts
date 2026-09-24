import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { buildAuditEventInput, emitAuditEvent, type AuditSink } from '../../../libs/platform/audit/src/index.ts';
import { getPatient, searchPatientDirectory, PatientApplicationError, PatientDirectoryCursorError } from '../../../libs/patient/application-entrypoint/src/index.ts';
import type { Patient } from '../../../libs/patient/domain/src/index.ts';
import { createPatientApplicationDependencies, createPatientDirectoryDependencies, type PatientRuntimeDependencies } from './patient-composition.ts';
import { createPatientAuthorization } from './patient-authorization.ts';

export async function projectPatient(patient: Patient, context: RequestContext, permissions: ReadonlySet<string>, careAccess?: PatientRuntimeDependencies['careAccess']) {
  if (!await createPatientAuthorization(permissions, careAccess).allows({ action: 'patient.read', context, patient })) {
    throw new PatientApplicationError('FORBIDDEN');
  }
  // Explicit allowlist: future fields, clinical content and internal user linkage stay hidden.
  // Never reinterpret legacy free text as the canonical structured contact.
  return { id: patient.patientId, workspaceId: patient.tenantId, versionToken: `"${patient.version}"`,
    access: { allowedActions: ['patient.read'] }, createdAt: patient.createdAt, updatedAt: patient.updatedAt,
    medicalRecordNumber: patient.medicalRecordNumber, fullName: patient.fullName,
    dateOfBirth: patient.dateOfBirth, sex: patient.sex, phone: patient.phone, email: patient.email,
    address: patient.address,
    ...(patient.emergencyContactDetails === undefined ? {} : { emergencyContact: patient.emergencyContactDetails }) };
}

export async function handlePatientRead(
  runtime: PatientRuntimeDependencies & { readonly audit?: AuditSink },
  context: RequestContext, permissions: ReadonlySet<string>, url: URL,
): Promise<{ status: 200 | 400 | 403 | 404 | 409 | 500 | 503; body: unknown; etag?: string }> {
  const careAccess = runtime.careAccess;
  const patientId = url.pathname === '/v1/patients' ? undefined : url.pathname.split('/').at(-1)!;
  const error = (status: 400 | 403 | 404 | 409 | 500 | 503, code: string) => ({ status,
    body: { error: { code, message: 'Patient read unavailable.', details: { fields: [], decisionIds: [] },
      requestId: context.requestId, correlationId: context.correlationId } } });
  if (!runtime.audit) return error(503, 'AUDIT_UNAVAILABLE');
  const audit = async (result: 'SUCCESS' | 'DENIED' | 'FAILURE') => {
    await emitAuditEvent(runtime.audit!, buildAuditEventInput(context, {
      id: randomUUID(), action: patientId ? 'patient.read' : 'patient.search', resourceType: 'PATIENT',
      resourceId: patientId ?? context.tenant!.tenantId, result,
      metadata: { membershipId: context.tenant!.membershipId, permissionRevision: context.tenant!.permissionRevision,
        authorizationPath: 'NORMAL', policy: 'BD-01' },
    }));
  };
  let response: Awaited<ReturnType<typeof handlePatientRead>>;
  let result: 'SUCCESS' | 'DENIED' | 'FAILURE' = 'SUCCESS';
  try {
    if (!await createPatientAuthorization(permissions, careAccess).allows({ action: 'patient.read', context })) throw new PatientApplicationError('FORBIDDEN');
    if (patientId) {
      if (url.search) return error(400, 'INVALID_QUERY');
      const patient = await getPatient(createPatientApplicationDependencies(runtime, permissions), context, patientId);
      response = { status: 200, body: { data: await projectPatient(patient, context, permissions, careAccess) }, etag: `"${patient.version}"` };
    } else {
      const query: Record<string, string | number> = {};
      for (const [key, value] of url.searchParams) {
        if (!['q', 'limit', 'cursor'].includes(key) || Object.hasOwn(query, key)) return error(400, 'INVALID_QUERY');
        if (key === 'limit' && !/^[1-9][0-9]*$/.test(value)) return error(400, 'INVALID_QUERY');
        query[key] = key === 'limit' ? Number(value) : value;
      }
      if (typeof query.cursor === 'string' && query.cursor.length > 2048) return error(400, 'INVALID_CURSOR');
      const page = await searchPatientDirectory(createPatientDirectoryDependencies(runtime, permissions), context,
        query as unknown as { q: string; limit?: number; cursor?: string });
      response = { status: 200, body: { data: await Promise.all(page.data.map(patient => projectPatient(patient, context, permissions, careAccess))), page: page.page } };
    }
  } catch (cause) {
    result = 'FAILURE';
    if (cause instanceof PatientApplicationError) {
      const code = cause.code;
      if (code === 'FORBIDDEN' || code === 'NOT_FOUND') result = 'DENIED';
      response = code === 'FORBIDDEN' ? error(403, code) : code === 'NOT_FOUND' ? error(404, 'RESOURCE_NOT_FOUND') : error(400, 'INVALID_QUERY');
    } else if (cause instanceof PatientDirectoryCursorError) {
      response = cause.code === 'CONTEXT_STALE' ? error(409, cause.code) : cause.code === 'CURSOR_NOT_CONFIGURED'
        ? error(503, 'SERVICE_UNAVAILABLE') : error(400, 'INVALID_CURSOR');
    } else response = error(500, 'INTERNAL_ERROR');
  }
  try { await audit(result); } catch { return error(503, 'AUDIT_UNAVAILABLE'); }
  return response;
}
