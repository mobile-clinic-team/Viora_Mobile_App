import type { Encounter, MedicalRecord, MedicalRecordVersion } from './index.ts';
export interface EncounterReadRepository {
  findById(input: { readonly tenantId: string; readonly encounterId: string }): Promise<Encounter | null>;
  listByPatient(input: { readonly tenantId: string; readonly patientId: string; readonly limit: number; readonly after?: readonly string[] }): Promise<readonly Encounter[]>;
}
export interface ClinicalRecordReadRepository {
  findById(input: { readonly tenantId: string; readonly medicalRecordId: string }): Promise<MedicalRecord | null>;
  findCurrentVersion(input: { readonly tenantId: string; readonly medicalRecordId: string }): Promise<MedicalRecordVersion | null>;
  findVersion(input: { readonly tenantId: string; readonly medicalRecordId: string; readonly versionId: string }): Promise<MedicalRecordVersion | null>;
  listVersions(input: { readonly tenantId: string; readonly medicalRecordId: string; readonly limit: number; readonly after?: readonly string[] }): Promise<readonly MedicalRecordVersion[]>;
}
