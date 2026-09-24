import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { readClinicalRecord } from '../../../libs/clinical/application-entrypoint/src/index.ts';
import { createDomainReadDependencies, createDomainReadRuntime } from './domain-read-composition.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { buildAuditEvent, buildAuditEventInput } from '../../../libs/platform/audit/src/index.ts';
import { randomUUID } from 'node:crypto';
import { PatientCommandError } from './patient-create-operation-contract.ts';

export function createClinicalHttpRead(database:TransactionalDatabase,cursorKey?:string) {
  return async(context:RequestContext,permissions:ReadonlySet<string>,sessionId:string,recordId:string)=>{
    const result=await readClinicalRecord(createDomainReadDependencies(createDomainReadRuntime(database,cursorKey),permissions).clinical,context,recordId);
    const {record,version}=result;
    const stored=(await database.query(`SELECT r.version_token,r.reviewed_version,v.source_ai_draft_id
      FROM medical_records r JOIN medical_record_versions v ON v.tenant_id=r.tenant_id AND v.medical_record_id=r.id
      WHERE r.tenant_id=$1 AND r.id=$2 AND v.id=$3 AND r.current_version=$4`,
    [context.tenant!.tenantId,recordId,version.versionId,version.version.toString()])).rows[0];
    if(!stored) throw new PatientCommandError('VERSION_CONFLICT',412);
    const audit=await new PostgresAuditEventRepository(database).append(buildAuditEvent(buildAuditEventInput(context,{
      id:randomUUID(),sessionId,action:'record.read',resourceType:'RECORD',resourceId:recordId,resourceVersion:record.currentVersion,result:'SUCCESS',metadata:{},
    })));
    if(audit.kind!=='APPENDED') throw new PatientCommandError('AUDIT_UNAVAILABLE',503);
    return {id:recordId,workspaceId:record.tenantId,versionToken:String(stored.version_token),access:{allowedActions:['record.read']},
      createdAt:record.createdAt,updatedAt:record.updatedAt,encounterId:record.encounterId,patientId:record.patientId,status:record.status,
      currentVersion:record.currentVersion.toString(),reviewedVersion:stored.reviewed_version===null?null:String(stored.reviewed_version),
      current:{id:version.versionId,recordId,version:version.version.toString(),content:{diagnosis:version.diagnosis,symptoms:version.symptoms,
        clinicalNotes:version.clinicalNotes,treatmentPlan:version.treatmentPlan},kind:stored.source_ai_draft_id?'AI_HANDOFF':'MANUAL',
      createdBy:version.createdBy,createdAt:version.createdAt,amendmentReason:version.amendmentReason,sourceDraftId:stored.source_ai_draft_id??null}};
  };
}
