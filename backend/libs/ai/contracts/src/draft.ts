import type { ClinicalRecordCreateRequest } from '../../../clinical/contracts/src/index.ts';

export type AiDraftStatus = 'GENERATED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface AiDraft {
  readonly id: string;
  readonly tenantId: string;
  readonly patientId: string;
  readonly encounterId: string | null;
  readonly createdBy: string;
  readonly draftType: string;
  readonly content: ClinicalRecordCreateRequest;
  readonly version: bigint;
  readonly status: AiDraftStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly rejectedBy: string | null;
  readonly rejectedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly targetRecordId?: string | null;
  readonly targetVersionToken?: string | null;
  readonly expiresAt?: string | null;
  readonly reviewedBy?: string | null;
  readonly decidedAt?: string | null;
}

export interface AiDraftRepository {
  create(input: Omit<AiDraft, 'id' | 'createdAt' | 'updatedAt'>): Promise<AiDraft>;
  findById(input: { readonly tenantId: string; readonly draftId: string }): Promise<AiDraft | null>;
  transition(input: {
    readonly tenantId: string;
    readonly draftId: string;
    readonly from: AiDraftStatus;
    readonly expectedVersion: bigint;
    readonly to: Exclude<AiDraftStatus, 'GENERATED' | 'EXPIRED'>;
    readonly actorId: string;
    readonly at: string;
  }): Promise<AiDraft | null>;
}
