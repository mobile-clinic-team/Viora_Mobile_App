import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import type { Patient } from '../../../libs/patient/domain/src/index.ts';
import type { CareAccessReader } from '../../../libs/patient/domain/src/care-access.ts';
import { PatientCommandError } from './patient-create-operation-contract.ts';
import { withinRoleCeiling } from './authorization-policy.ts';

/** BD-01 + BD-02; kept separate from the legacy non-atomic mutation adapter. */
export async function authorizePatientCommand(context: RequestContext, grants: ReadonlySet<string>,
  action: 'patient.create' | 'patient.update', careAccess?: CareAccessReader, patient?: Patient): Promise<void> {
  const actor = context.actor;
  const tenant = context.tenant;
  if (!actor || !actor.subject || actor.kind !== 'HUMAN' || !tenant?.membershipId || !tenant.permissionRevision ||
      !grants.has(action) || (patient && patient.tenantId !== tenant.tenantId)) {
    throw new PatientCommandError('FORBIDDEN', 403);
  }
  const roles = tenant.roles ?? [];
  if (!withinRoleCeiling(roles, action)) throw new PatientCommandError('FORBIDDEN', 403);
  if (roles.includes('CLINIC_ADMIN') || roles.includes('NURSE')) return;
  if (roles.includes('DOCTOR')) {
    if (action === 'patient.create') return;
    if (patient && careAccess && await careAccess.hasActive({ tenantId: tenant.tenantId,
      membershipId: tenant.membershipId, userId: actor.userId, patientId: patient.patientId, kind: 'DOCTOR_RELATIONSHIP' })) return;
  }
  // Receptionist workflow necessity is not established by role or body claims.
  throw new PatientCommandError('FORBIDDEN', 403);
}
