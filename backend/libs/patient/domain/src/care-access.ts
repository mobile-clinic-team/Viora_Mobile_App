/** Internal persisted authorization state, never a request claim or public permission. */
export type CareAccessKind = 'DOCTOR_RELATIONSHIP' | 'NURSE_ASSIGNMENT';
export interface CareAccessScope {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly patientId: string;
  readonly kind: CareAccessKind;
}
export interface CareAccessReader {
  hasActive(input: CareAccessScope & { readonly userId: string }): Promise<boolean>;
}
