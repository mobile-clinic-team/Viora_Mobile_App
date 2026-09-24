import { randomUUID } from 'node:crypto';
import type { AiQueryClient } from './index.ts';

export interface DraftTarget {
  readonly recordId: string;
  readonly patientId: string;
  readonly encounterId: string;
  readonly recordVersion: bigint;
  readonly versionToken: string;
  readonly sourceId: string;
  readonly sourceVersionToken: string;
}

/** References only. The immutable Clinical version is the sole source in this
 * slice; unversioned knowledge cannot satisfy the public Provenance contract. */
export class PostgresDraftProvenanceRepository {
  private readonly database: AiQueryClient;
  constructor(database: AiQueryClient) { this.database = database; }

  async target(tenantId: string, recordId: string, lock: boolean | 'UPDATE' = false): Promise<DraftTarget | null> {
    const result = await this.database.query(`SELECT r.id, r.patient_id, r.encounter_id,
      r.current_version, r.version_token, v.id AS source_id, v.version_token AS source_version_token
      FROM medical_records r
      JOIN encounters e ON e.tenant_id=r.tenant_id AND e.id=r.encounter_id AND e.patient_id=r.patient_id
      JOIN patients p ON p.tenant_id=r.tenant_id AND p.id=r.patient_id
      JOIN medical_record_versions v ON v.tenant_id=r.tenant_id AND v.medical_record_id=r.id AND v.version=r.current_version
      WHERE r.tenant_id=$1 AND r.id=$2 AND r.status='DRAFT'
      ${lock === 'UPDATE' ? 'FOR UPDATE OF r FOR SHARE OF e, p' : lock ? 'FOR SHARE OF r, e, p' : ''}`, [tenantId, recordId]);
    const row = result.rows[0];
    return row ? { recordId: String(row.id), patientId: String(row.patient_id), encounterId: String(row.encounter_id),
      recordVersion: BigInt(String(row.current_version)), versionToken: String(row.version_token),
      sourceId: String(row.source_id), sourceVersionToken: String(row.source_version_token) } : null;
  }

  async append(input: { tenantId: string; draftId: string; target: DraftTarget;
    metadata: Readonly<Record<string, string>> }): Promise<string> {
    const { target } = input;
    const id = randomUUID();
    const result = await this.database.query(`INSERT INTO ai_provenance
      (id,tenant_id,draft_id,target_record_id,target_record_version,target_version_token,ordinal,source_type,source_reference,metadata,created_at)
      SELECT $1,d.tenant_id,d.id,r.id,r.current_version,r.version_token,0,'RECORD_VERSION',v.id::text,$8::jsonb,CURRENT_TIMESTAMP
      FROM ai_drafts d JOIN medical_records r ON r.tenant_id=d.tenant_id AND r.id=d.target_record_id
        AND r.patient_id=d.patient_id AND r.encounter_id=d.encounter_id AND r.version_token=d.target_version_token
      JOIN medical_record_versions v ON v.tenant_id=r.tenant_id AND v.medical_record_id=r.id AND v.version=r.current_version
      WHERE d.tenant_id=$2 AND d.id=$3 AND r.id=$4 AND r.current_version=$5 AND r.version_token=$6
        AND v.id=$7 AND v.version_token=$9 AND d.status='GENERATED' AND d.version=1 AND r.status='DRAFT'
      RETURNING id`, [id,input.tenantId,input.draftId,target.recordId,target.recordVersion.toString(),
      target.versionToken,target.sourceId,JSON.stringify({ ...input.metadata, sourceVersion: target.sourceVersionToken }),target.sourceVersionToken]);
    if (!result.rows[0]) throw new Error('PROVENANCE_BINDING_CONFLICT');
    return id;
  }
}
