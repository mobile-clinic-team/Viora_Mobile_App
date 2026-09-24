export type EncounterStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MedicalRecordStatus = 'DRAFT' | 'IN_REVIEW' | 'FINALIZED' | 'AMENDED';

/**
 * Read projection for authorized encounter-history consumers. Tenant and
 * patient identity are retained for scope checks; record content, appointment
 * linkage, and persistence timestamps are not part of this projection.
 */
export interface EncounterSummary {
  readonly encounterId: string;
  readonly tenantId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly status: EncounterStatus;
}

export interface EncounterCreateRequest {
  readonly patientId: string;
  readonly appointmentId?: string;
  readonly doctorId: string;
  readonly startedAt?: string;
}

export interface ClinicalRecordCreateRequest {
  readonly diagnosis: string;
  readonly symptoms: string;
  readonly clinicalNotes: string;
  readonly treatmentPlan: string;
}

export interface ClinicalRecordAmendmentRequest extends ClinicalRecordCreateRequest {
  readonly amendmentReason: string;
}
