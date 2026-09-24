import { randomUUID } from 'node:crypto';
import type { AiDraft } from '../../contracts/src/index.ts';
import type { AiQueryClient } from './index.ts';

export interface DraftHandoff {
  operationId: string; recordId: string; recordVersionId: string; recordVersionToken: string;
  recordVersion: bigint; approvedDraftVersionToken: string; auditEventId: string; committedAt: string;
}
export class PostgresDraftHandoffRepository {
  private readonly db: AiQueryClient;
  constructor(db: AiQueryClient) { this.db=db; }
  async sources(tenantId:string,draftId:string) {
    const result=await this.db.query(`SELECT p.id,p.source_reference,p.metadata->>'sourceVersion' AS source_version
      FROM ai_provenance p JOIN medical_record_versions v ON v.tenant_id=p.tenant_id AND v.id::text=p.source_reference
        AND v.medical_record_id=p.target_record_id AND v.version=p.target_record_version
        AND v.version_token=p.metadata->>'sourceVersion'
      WHERE p.tenant_id=$1 AND p.draft_id=$2 AND p.source_type='RECORD_VERSION' ORDER BY p.ordinal`,[tenantId,draftId]);
    return result.rows.map(row=>({id:String(row.id),kind:'RECORD_VERSION' as const,sourceId:String(row.source_reference),
      sourceVersion:String(row.source_version),label:'Clinical record version',excerpt:null}));
  }
  async validateProvenance(draft: AiDraft, targetVersion: bigint): Promise<readonly string[]> {
    const result=await this.db.query(`SELECT p.id,
      (p.target_record_id=$3 AND p.target_version_token=$4 AND p.target_record_version=$5
        AND p.source_type='RECORD_VERSION' AND v.id IS NOT NULL
        AND v.medical_record_id=$3 AND v.version=$5 AND p.metadata->>'sourceVersion'=v.version_token) AS valid
      FROM ai_provenance p LEFT JOIN medical_record_versions v
        ON v.tenant_id=p.tenant_id AND v.id::text=p.source_reference
      WHERE p.tenant_id=$1 AND p.draft_id=$2 ORDER BY p.ordinal FOR SHARE OF p`,
    [draft.tenantId,draft.id,draft.targetRecordId,draft.targetVersionToken,targetVersion.toString()]);
    if (result.rows.length<1 || result.rows.length>8 || result.rows.some(row=>row.valid!==true)) throw new Error('PROVENANCE_CONFLICT');
    return result.rows.map(row=>String(row.id));
  }
  async append(input: {tenantId:string;draftId:string;operationId:string;recordId:string;recordVersionId:string;
    recordVersion:bigint;recordVersionToken:string;approvedDraftVersionToken:string;auditEventId:string;committedAt?:string}): Promise<DraftHandoff> {
    const result=await this.db.query(`INSERT INTO ai_handoffs
      (id,tenant_id,draft_id,operation_id,record_id,record_version_id,record_version,record_version_token,approved_draft_version_token,audit_event_id,committed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,clock_timestamp())) RETURNING committed_at`,
    [randomUUID(),input.tenantId,input.draftId,input.operationId,input.recordId,input.recordVersionId,
      input.recordVersion.toString(),input.recordVersionToken,input.approvedDraftVersionToken,input.auditEventId,input.committedAt??null]);
    return {...input,committedAt:new Date(String(result.rows[0].committed_at)).toISOString()};
  }
  async find(tenantId:string,draftId:string):Promise<DraftHandoff|null> {
    const row=(await this.db.query(`SELECT h.*,o.idempotency_key FROM ai_handoffs h JOIN operations o
      ON o.tenant_id=h.tenant_id AND o.id=h.operation_id WHERE h.tenant_id=$1 AND h.draft_id=$2`,[tenantId,draftId])).rows[0];
    return row ? {operationId:String(row.idempotency_key),recordId:String(row.record_id),recordVersionId:String(row.record_version_id),
      recordVersion:BigInt(String(row.record_version)),recordVersionToken:String(row.record_version_token),
      approvedDraftVersionToken:String(row.approved_draft_version_token),auditEventId:String(row.audit_event_id),
      committedAt:new Date(String(row.committed_at)).toISOString()} : null;
  }
}
