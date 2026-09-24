import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresDoctorRepository, PostgresShiftRepository } from '../../../libs/doctor/data-access/src/index.ts';
import { PostgresAppointmentRepository } from '../../../libs/appointment/data-access/src/index.ts';
import { PostgresEncounterRepository, PostgresMedicalRecordRepository } from '../../../libs/clinical/data-access/src/index.ts';
import type { DoctorReadDependencies } from '../../../libs/doctor/application-entrypoint/src/index.ts';
import type { AppointmentReadDependencies } from '../../../libs/appointment/application-entrypoint/src/index.ts';
import type { ClinicalReadDependencies } from '../../../libs/clinical/application-entrypoint/src/index.ts';
import { createReadCursorCodec } from './read-cursor.ts';
import { PostgresCareAccessRepository } from '../../../libs/patient/data-access/src/postgres-care-access-repository.ts';
import { effectiveGrants } from './authorization-policy.ts';

/** Construct once on the shared database; never allocate pools per request. */
export function createDomainReadRuntime(database: TransactionalDatabase, cursorKey: string | undefined) {
  return { doctors: new PostgresDoctorRepository(database), shifts: new PostgresShiftRepository(database),
    appointments: new PostgresAppointmentRepository(database), encounters: new PostgresEncounterRepository(database),
    records: new PostgresMedicalRecordRepository(database), cursor: createReadCursorCodec(cursorKey),
    careAccess: new PostgresCareAccessRepository(database) };
}
export function createDomainReadDependencies(runtime: ReturnType<typeof createDomainReadRuntime>, permissions: ReadonlySet<string>): {
  readonly doctor: DoctorReadDependencies; readonly appointment: AppointmentReadDependencies; readonly clinical: ClinicalReadDependencies;
} {
  // Appointment workflows remain unresolved. Clinical linkage comes from repository rows.
  const canRead = () => false;
  const clinical: ClinicalReadDependencies = { ...runtime, permissions,
    canRead: async (context, resource) => {
      const tenant = context.tenant;
      if (!context.actor?.userId || !tenant?.membershipId || !tenant.permissionRevision ||
          resource.tenantId !== tenant.tenantId || !resource.patientId) return false;
      const roles = tenant.roles ?? [];
      const permission = 'encounterId' in resource && !('medicalRecordId' in resource) ? 'encounter.read' : 'record.read';
      if (!effectiveGrants(roles, permissions).has(permission)) return false;
      const scope = { tenantId: tenant.tenantId, membershipId: tenant.membershipId,
        userId: context.actor.userId, patientId: resource.patientId };
      if (roles.includes('DOCTOR') && await runtime.careAccess.hasActive({ ...scope, kind: 'DOCTOR_RELATIONSHIP' })) return true;
      return roles.includes('NURSE') && await runtime.careAccess.hasActive({ ...scope, kind: 'NURSE_ASSIGNMENT' });
    } };
  return { doctor: { ...runtime, permissions }, appointment: { ...runtime, permissions, canRead }, clinical };
}
