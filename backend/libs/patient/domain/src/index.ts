import type { PatientReference } from '../../contracts/src/index.ts';

/**
 * BD-02 canonical Patient value sets.
 * Deceased and archive state are separate concepts and are not encoded here.
 */
export type PatientStatus = 'ACTIVE' | 'INACTIVE';
export type PatientSex = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';

export interface PatientEmergencyContact {
  readonly name: string;
  readonly phone: string;
  readonly relationship: string | null;
}

export interface Patient extends PatientReference {
  readonly userId: string | null;
  readonly medicalRecordNumber: string;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly sex: PatientSex;
  readonly phone: string;
  readonly email: string;
  readonly address: string;
  readonly emergencyContact: string;
  readonly emergencyContactDetails?: PatientEmergencyContact | null;
  readonly status: PatientStatus;
  readonly version: bigint;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PatientCreate {
  readonly userId: string | null;
  readonly medicalRecordNumber: string;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly sex: PatientSex;
  readonly phone: string;
  readonly email: string;
  readonly address: string;
  readonly emergencyContact: string;
  readonly emergencyContactDetails?: PatientEmergencyContact | null;
  readonly status: PatientStatus;
}

/**
 * This is a persistence-level patch shape. PAT-002 remains responsible for
 * validating the API allowlist and authorization for each requested field.
 */
export interface PatientProfileChanges {
  readonly fullName?: string;
  readonly dateOfBirth?: string;
  readonly sex?: PatientSex;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly emergencyContact?: string;
  readonly emergencyContactDetails?: PatientEmergencyContact | null;
  readonly status?: PatientStatus;
}

export class PatientTenantScopeError extends Error {
  public constructor() {
    super('patient does not belong to the requested tenant');
    this.name = 'PatientTenantScopeError';
  }
}

/**
 * Shared fail-closed guard for callers that receive a Patient before using it
 * in a tenant-scoped workflow.
 */
export function assertPatientTenantScope(
  patient: PatientReference,
  tenantId: string,
): void {
  if (!tenantId.trim() || patient.tenantId !== tenantId) {
    throw new PatientTenantScopeError();
  }
}
