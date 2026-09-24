import type { PatientApplicationDependencies } from '../../../libs/patient/application-entrypoint/src/index.ts';
import type { PatientDirectoryDependencies } from '../../../libs/patient/application-entrypoint/src/index.ts';
import { createPatientAuthorization } from './patient-authorization.ts';
import type { CareAccessReader } from '../../../libs/patient/domain/src/care-access.ts';

export type PatientRuntimeDependencies = Pick<
  PatientApplicationDependencies,
  'patients' | 'idempotency'
> & Pick<PatientDirectoryDependencies, 'patients' | 'patientDirectoryCursor'> & { readonly careAccess?: CareAccessReader };

/** Supply permissions from the authenticated workspace permission preflight. */
export function createPatientApplicationDependencies(
  runtime: PatientRuntimeDependencies,
  permissions: ReadonlySet<string>,
): PatientApplicationDependencies {
  return {
    patients: runtime.patients,
    idempotency: runtime.idempotency,
    authorization: createPatientAuthorization(permissions, runtime.careAccess),
  };
}

export function createPatientDirectoryDependencies(
  runtime: PatientRuntimeDependencies,
  permissions: ReadonlySet<string>,
): PatientDirectoryDependencies {
  return {
    patients: runtime.patients,
    patientDirectoryCursor: runtime.patientDirectoryCursor,
    authorization: createPatientAuthorization(permissions, runtime.careAccess),
  };
}
