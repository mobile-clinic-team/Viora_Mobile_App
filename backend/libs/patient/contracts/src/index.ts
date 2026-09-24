/**
 * Stable cross-domain reference to a Patient. This is intentionally limited
 * to identity and tenant ownership; it does not expose patient profile data.
 */
export interface PatientReference {
  readonly patientId: string;
  readonly tenantId: string;
}

/**
 * Read projection for authorized application consumers. This is not a full
 * Patient entity or an authorization grant; contact and persistence fields
 * stay outside this contract. PatientReference remains identity-only.
 */
export interface PatientSummary extends PatientReference {
  readonly medicalRecordNumber: string;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly sex: string;
  readonly status: string;
}

export interface PatientCreateRequest {
  readonly userId?: string | null;
  readonly medicalRecordNumber?: string;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly sex: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly emergencyContact?: string;
}

export interface PatientPatchRequest {
  readonly fullName?: string;
  readonly dateOfBirth?: string;
  readonly sex?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly emergencyContact?: string;

}

export interface PatientListQuery {
  readonly medicalRecordNumber?: string;
  readonly fullName?: string;
  readonly dateOfBirth?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

/** Canonical P01 query, separate from legacy internal list filters. */
export interface PatientDirectoryQuery {
  readonly q: string;
  readonly limit?: number;
  readonly cursor?: string;
}
