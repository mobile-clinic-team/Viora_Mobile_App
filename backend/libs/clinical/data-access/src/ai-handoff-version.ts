import { randomUUID } from 'node:crypto';
import type { DatabaseSession } from '../../../platform/database/src/index.ts';
import type { ClinicalRecordCreateRequest } from '../../contracts/src/index.ts';

/** Called only inside the approval transaction after Clinical authorization.
 * Appends immutable AI-derived content, keeps the target DRAFT, clears review. */
export async function appendAiHandoffVersion(db: DatabaseSession, input: {
  tenantId: string; recordId: string; patientId: string; encounterId: string;
  expectedVersion: bigint; expectedToken: string; draftId: string; actorId: string;
  content: ClinicalRecordCreateRequest;
}) {
  const next=input.expectedVersion+1n,token=`"${next}"`,id=randomUUID();
  const record=await db.query(`UPDATE medical_records SET current_version=$6,version_token=$7,
    reviewed_version=NULL,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND id=$2 AND patient_id=$3 AND encounter_id=$4
      AND current_version=$5 AND version_token=$8 AND status='DRAFT' RETURNING id`,
  [input.tenantId,input.recordId,input.patientId,input.encounterId,input.expectedVersion.toString(),next.toString(),token,input.expectedToken]);
  if (!record.rows[0]) throw new Error('VERSION_CONFLICT');
  const inserted=await db.query(`INSERT INTO medical_record_versions
    (id,tenant_id,medical_record_id,version,version_token,diagnosis,symptoms,clinical_notes,treatment_plan,created_by,source_ai_draft_id,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,date_trunc('milliseconds',clock_timestamp())) RETURNING created_at`,
  [id,input.tenantId,input.recordId,next.toString(),token,input.content.diagnosis,input.content.symptoms,
    input.content.clinicalNotes,input.content.treatmentPlan,input.actorId,input.draftId]);
  return {recordId:input.recordId,recordVersionId:id,recordVersion:next,recordVersionToken:token,
    committedAt:new Date(String(inserted.rows[0].created_at)).toISOString()};
}
