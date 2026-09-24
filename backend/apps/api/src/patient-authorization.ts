import type {
  PatientAuthorization,
} from '../../../libs/patient/application-entrypoint/src/index.ts';
import { withinRoleCeiling } from './authorization-policy.ts';
import type { CareAccessReader } from '../../../libs/patient/domain/src/care-access.ts';

export function createPatientAuthorization(
  permissions: ReadonlySet<string>,
  careAccess?: CareAccessReader,
): PatientAuthorization {
  return {
    allows({ action, context, patient }) {
      const tenant = context.tenant;
      const roles = tenant?.roles ?? [];
      if (!context.actor?.userId || !tenant?.membershipId || !tenant.permissionRevision ||
          !tenant.tenantId || !permissions.has(action) || !withinRoleCeiling(roles, action) ||
          (patient !== undefined && patient.tenantId !== tenant.tenantId)) return false;
      if (action !== 'patient.read') return false;
      if (roles.some(role => role === 'CLINIC_ADMIN' || role === 'NURSE')) return true;
      if (!roles.includes('DOCTOR') || !careAccess) return false;
      // Preflight permits lookup only. Resource checks always use the persisted row.
      if (!patient) return true;
      return careAccess.hasActive({ tenantId: tenant.tenantId, membershipId: tenant.membershipId,
        userId: context.actor.userId, patientId: patient.patientId, kind: 'DOCTOR_RELATIONSHIP' });
    },
  };
}
