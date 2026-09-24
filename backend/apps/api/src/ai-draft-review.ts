import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import type { TransactionalDatabase, DatabaseSession } from '../../../libs/platform/database/src/index.ts';
import { buildAuditEvent,buildAuditEventInput } from '../../../libs/platform/audit/src/index.ts';
import { MandatoryAuditError } from '../../../libs/platform/audit/src/mandatory-audit.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { PostgresAiDraftRepository } from '../../../libs/ai/data-access/src/index.ts';
import type { AiDraft } from '../../../libs/ai/contracts/src/index.ts';
import { PostgresDraftProvenanceRepository } from '../../../libs/ai/data-access/src/draft-provenance.ts';
import { PostgresDraftHandoffRepository } from '../../../libs/ai/data-access/src/draft-handoff-repository.ts';
import { PostgresDraftAssuranceRepository, type DraftAssuranceBinding } from '../../../libs/identity/data-access/src/draft-assurance-repository.ts';
import { readClinicalRecord } from '../../../libs/clinical/application-entrypoint/src/index.ts';
import { appendAiHandoffVersion } from '../../../libs/clinical/data-access/src/ai-handoff-version.ts';
import { PostgresOperationStore,type OperationRecord } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import { createAiReadRuntime,type AiReadRequestIdentity } from './ai-read-composition.ts';
import { createDomainReadDependencies,createDomainReadRuntime } from './domain-read-composition.ts';
import { parseOperationIdentity,patientCommandFingerprint,PatientCommandError } from './patient-create-operation-contract.ts';
import { patientExpectedVersion } from './patient-command-validation.ts';
import { parseDraftContent } from './ai-draft-generation.ts';

export type DraftHumanAction='draft.read'|'draft.review'|'draft.edit'|'draft.reject'|'draft.approve';
/** Server-owned policy resolves BD-05/role ceilings; never supplied by clients.
 * Clinical reads independently enforce BD-01. Approval additionally needs the
 * explicit record.edit grant and approved Clinical write policy. */
export interface DraftHumanPolicy {
  allows(context:RequestContext,action:DraftHumanAction):boolean;
  canEditRecord(context:RequestContext,draft:AiDraft):boolean|Promise<boolean>;
}
export interface VerifiedDraftMfa extends DraftAssuranceBinding { readonly authenticatedAt:string; }
/** Adapter must verify signed OIDC evidence, configured MFA amr/acr, nonce and
 * STEP_UP challenge. Its absence keeps issuance unavailable. Not a client flag. */
export type DraftMfaVerifier=(proof:unknown,binding:DraftAssuranceBinding)=>Promise<VerifiedDraftMfa>;
function fail(code:string,status=409):never {throw new PatientCommandError(code,status);}
function object(body:unknown,keys:readonly string[]):Record<string,unknown> {
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==keys.length ||
    Object.keys(body).some(key=>!keys.includes(key))) fail('VALIDATION_ERROR',422);
  return body as Record<string,unknown>;
}
export function validateDraftHumanCommand(action:Exclude<DraftHumanAction,'draft.read'>,body:unknown) {
  if(action==='draft.review') return object(body,[]);
  if(action==='draft.edit') return {content:parseDraftContent(JSON.stringify(object(body,['content']).content))};
  if(action==='draft.reject') {
    const value=object(body,['reason']);
    if(value.reason!==null && (typeof value.reason!=='string'||!value.reason.trim()||[...value.reason].length>2000)) fail('VALIDATION_ERROR',422);
    // No approved reason retention configuration exists in this backend.
    if(value.reason!==null) fail('FEATURE_UNAVAILABLE',503);
    return value;
  }
  const value=object(body,['targetRecordId','targetVersionToken']);
  if(typeof value.targetRecordId!=='string'||typeof value.targetVersionToken!=='string') fail('VALIDATION_ERROR',422);
  return value;
}
export function createAiDraftReviewRuntime(database:TransactionalDatabase,options:{
  readonly cursorKey?:string;readonly policy?:DraftHumanPolicy;readonly verifyMfa?:DraftMfaVerifier;
}) {
  return {bind(request:AiReadRequestIdentity) {
    createAiReadRuntime(database,{cursorKey:options.cursorKey}).bind(request);
    const {context,identity,permissions}=request;
    const tenantId=context.tenant!.tenantId,actorId=context.actor!.userId;
    const policy=(action:DraftHumanAction)=>{
      createAiReadRuntime(database,{cursorKey:options.cursorKey}).bind(request);
      if(context.actor?.kind!=='HUMAN') fail('FORBIDDEN',403);
      if(!permissions.has(action)||!options.policy?.allows(context,action)) fail('FORBIDDEN',403);
    };
    const session=async(db:DatabaseSession)=>{
      const row=(await db.query(`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id
        JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
        WHERE s.id=$1 AND s.user_id=$2 AND s.status='ACTIVE' AND u.status='ACTIVE'
          AND s.expires_at>clock_timestamp() AND s.access_expires_at>clock_timestamp()
          AND m.id=$3 AND m.tenant_id=$4 AND m.status='ACTIVE' AND t.status='ACTIVE'
          AND ('"'||m.permission_revision::text||'"')=$5 AND m.role::text=ANY($6::text[])
        FOR SHARE OF s,u,m,t`,
      [identity.sessionId,actorId,context.tenant!.membershipId,tenantId,context.tenant!.permissionRevision,context.tenant!.roles??[]])).rows[0];
      if(!row) fail('UNAUTHENTICATED',401);
    };
    const audit=async(db:DatabaseSession,action:string,draft:AiDraft,operationId:string|null,metadata:Record<string,string>)=>{
      const id=randomUUID();
      try {
        const result=await new PostgresAuditEventRepository(db).append(buildAuditEvent(buildAuditEventInput(context,{
          id,sessionId:identity.sessionId,action,resourceType:'AI_DRAFT',resourceId:draft.id,resourceVersion:draft.version,
          operationId,result:'SUCCESS',metadata,
        })));
        if(result.kind!=='APPENDED') throw new MandatoryAuditError();
      } catch {throw new MandatoryAuditError();}
      return id;
    };
    const load=async(db:TransactionalDatabase,draftId:string,action:DraftHumanAction,lock=false)=>{
      policy(action);await session(db);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftId)) fail('RESOURCE_NOT_FOUND',404);
      if(lock) await db.query('SELECT id FROM ai_drafts WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,draftId]);
      const draft=await new PostgresAiDraftRepository(db).findById({tenantId,draftId});
      if(!draft?.targetRecordId||!draft.targetVersionToken||!draft.encounterId) fail('RESOURCE_NOT_FOUND',404);
      const clinical=createDomainReadDependencies(createDomainReadRuntime(db,options.cursorKey),permissions).clinical;
      const record=await readClinicalRecord(clinical,context,draft.targetRecordId);
      if(record.record.patientId!==draft.patientId||record.record.encounterId!==draft.encounterId) fail('RESOURCE_NOT_FOUND',404);
      if(!draft.expiresAt||Date.parse(draft.expiresAt)<=Date.now()) fail('RESOURCE_EXPIRED',410);
      return draft;
    };
    const current=(draft:AiDraft,expected:bigint)=>{
      if(draft.version!==expected) fail('VERSION_CONFLICT',412);
    };
    const fresh=async(db:DatabaseSession,draft:AiDraft,write=false)=>{
      const target=await new PostgresDraftProvenanceRepository(db).target(tenantId,draft.targetRecordId!,write?'UPDATE':true);
      if(!target||target.versionToken!==draft.targetVersionToken||target.patientId!==draft.patientId||target.encounterId!==draft.encounterId) fail('VERSION_CONFLICT',412);
      const provenanceIds=await new PostgresDraftHandoffRepository(db).validateProvenance(draft,target.recordVersion);
      return {target,provenanceIds};
    };
    const binding=(draft:AiDraft):DraftAssuranceBinding=>({tenantId,actorId,sessionId:identity.sessionId,draftId:draft.id,
      draftVersion:draft.version,targetRecordId:draft.targetRecordId!,targetVersionToken:draft.targetVersionToken!});
    const authorizeWrite=async(draft:AiDraft)=>{
      if(!permissions.has('record.edit')||!await options.policy!.canEditRecord(context,draft)) fail('FORBIDDEN',403);
    };
    const receipt=async(operation:OperationRecord)=>{
      if(operation.status!=='SUCCEEDED'||operation.resultResourceType!=='AI_DRAFT'||!operation.resultResourceId||operation.resultResourceVersion===null) fail('INTERNAL_ERROR',500);
      const handoff=await new PostgresDraftHandoffRepository(database).find(tenantId,operation.resultResourceId);
      // A review receipt must not gain a handoff created by a later operation.
      const own=handoff?.operationId===operation.idempotencyKey?handoff:null;
      return {operationId:operation.idempotencyKey,state:'SUCCEEDED',primary:{type:'AI_DRAFT',id:operation.resultResourceId,parentId:null,versionToken:`"${operation.resultResourceVersion}"`},
        related:own?[{type:'RECORD',id:own.recordId,parentId:null,versionToken:own.recordVersionToken},
          {type:'RECORD_VERSION',id:own.recordVersionId,parentId:own.recordId,versionToken:null}]:[],
        handoff:own?{...own,recordVersion:own.recordVersion.toString()}:null,
        committedAt:own?.committedAt??operation.updatedAt.toISOString(),expiresAt:new Date(operation.updatedAt.getTime()+86_400_000).toISOString()};
    };
    return {
      async assuranceBinding(input:{draftId:string;ifMatch:unknown}) {
        const draft=await load(database,input.draftId,'draft.approve');current(draft,patientExpectedVersion(input.ifMatch));
        await authorizeWrite(draft);await fresh(database,draft);
        if(draft.status!=='REVIEWING'||!draft.reviewedBy) fail('INVALID_STATE');
        return binding(draft);
      },
      async recover(operation:OperationRecord) {
        if(operation.tenantId!==tenantId||operation.actorId!==actorId||!operation.resultResourceId) fail('OPERATION_NOT_FOUND',404);
        await load(database,operation.resultResourceId,'draft.read');
        return receipt(operation);
      },
      async list(targetRecordId:string) {
        policy('draft.read');await session(database);
        await readClinicalRecord(createDomainReadDependencies(createDomainReadRuntime(database,options.cursorKey),permissions).clinical,context,targetRecordId);
        const rows=await database.query(`SELECT id FROM ai_drafts WHERE tenant_id=$1 AND target_record_id=$2
          AND expires_at>clock_timestamp() ORDER BY created_at DESC,id DESC LIMIT 101`,[tenantId,targetRecordId]);
        if(rows.rows.length>100) fail('RESULT_LIMIT_EXCEEDED',422);
        return rows.rows.map(row=>String(row.id));
      },
      async read(draftId:string) {
        const draft=await load(database,draftId,'draft.read');
        const provenance=await new PostgresDraftHandoffRepository(database).sources(tenantId,draftId);
        if(!provenance.length) fail('PROVENANCE_CONFLICT');
        await audit(database,'draft.read',draft,null,{});
        // Explicit projection; no raw storage columns or numeric bigint escapes.
        const handoff=await new PostgresDraftHandoffRepository(database).find(tenantId,draftId);
        return {id:draft.id,workspaceId:tenantId,draftType:'CLINICAL_NOTE',
          access:{allowedActions:['draft.read','draft.review','draft.edit','draft.reject','draft.approve'].filter(action=>permissions.has(action)&&options.policy?.allows(context,action as DraftHumanAction))},
          patientId:draft.patientId,encounterId:draft.encounterId,content:draft.content,provenance,
          targetRecordId:draft.targetRecordId,targetVersionToken:draft.targetVersionToken,versionToken:`"${draft.version}"`,
          status:draft.status,reviewedBy:draft.reviewedBy,approvedBy:draft.approvedBy,rejectedBy:draft.rejectedBy,
          createdBy:draft.createdBy,createdAt:draft.createdAt,updatedAt:draft.updatedAt,expiresAt:draft.expiresAt,
          decidedAt:['APPROVED','REJECTED'].includes(draft.status)?draft.updatedAt:null,
          handoff:handoff?{...handoff,recordVersion:handoff.recordVersion.toString()}:null};
      },
      async issueAssurance(input:{draftId:string;ifMatch:unknown;proof:unknown}) {
        const expected=patientExpectedVersion(input.ifMatch);
        const draft=await load(database,input.draftId,'draft.approve');current(draft,expected);await authorizeWrite(draft);
        if(draft.status!=='REVIEWING'||!draft.reviewedBy) fail('INVALID_STATE');
        if(!options.verifyMfa) fail('ASSURANCE_REQUIRED',403);
        const bound=binding(draft),evidence=await options.verifyMfa(input.proof,bound);
        if(Object.keys(bound).some(key=>bound[key as keyof DraftAssuranceBinding]!==evidence[key as keyof DraftAssuranceBinding])||
          !Number.isFinite(Date.parse(evidence.authenticatedAt))||Date.parse(evidence.authenticatedAt)>Date.now()||
          Date.now()-Date.parse(evidence.authenticatedAt)>300_000) fail('ASSURANCE_REQUIRED',403);
        return database.transaction(async tx=>{
          const db:TransactionalDatabase={...tx,transaction:work=>work(tx),close:async()=>{}};
          const latest=await load(db,input.draftId,'draft.approve',true);current(latest,expected);await fresh(tx,latest);
          if(latest.status!=='REVIEWING'||!latest.reviewedBy) fail('INVALID_STATE');
          const grant=await new PostgresDraftAssuranceRepository(tx).issue(binding(latest));
          await audit(tx,'assurance.issued',latest,null,{action:'draft.approve',targetVersionToken:latest.targetVersionToken!});
          return grant;
        });
      },
      async command(input:{action:Exclude<DraftHumanAction,'draft.read'>;draftId:string;ifMatch:unknown;body:unknown;
        key:unknown;timestamp:unknown;assuranceToken?:string}) {
        const expected=patientExpectedVersion(input.ifMatch);
        const parsed=validateDraftHumanCommand(input.action,input.body);
        const draft=await load(database,input.draftId,input.action);
        if(input.action==='draft.approve') await authorizeWrite(draft);
        const identity=parseOperationIdentity(input.key,input.timestamp),operations=new PostgresOperationStore(database);
        const suffix=input.action.slice(6);
        const admitted=await operations.admit({...identity,tenantId,actorId,requestFingerprint:patientCommandFingerprint(input.body,
          identity.operationCreatedAt,input.action==='draft.edit'?'PATCH':'POST',`/v1/ai/drafts/${draft.id}${suffix==='edit'?'':`/${suffix}`}`,input.ifMatch)});
        const operation=admitted.record;
        if(admitted.kind==='CONFLICT') fail('IDEMPOTENCY_CONFLICT');
        if(admitted.kind==='IN_PROGRESS') fail('OPERATION_IN_PROGRESS');
        if(admitted.kind==='REPLAY') {
          if(Date.now()>=operation.updatedAt.getTime()+86_400_000) fail('OPERATION_EXPIRED',410);
          if(operation.status!=='SUCCEEDED') fail(operation.failureCode??'OPERATION_CLOSED',operation.resultHttpStatus??409);
          await audit(database,'operation.replayed',draft,operation.operationId,{});
          return {receipt:await receipt(operation),replayed:true};
        }
        try {
          const settled=await database.transaction(async tx=>{
            const db:TransactionalDatabase={...tx,transaction:work=>work(tx),close:async()=>{}};
            const latest=await load(db,draft.id,input.action,true);current(latest,expected);
            const repository=new PostgresAiDraftRepository(tx);
            const required=input.action==='draft.review'?'GENERATED':'REVIEWING';
            if(latest.status!==required||(required==='REVIEWING'&&!latest.reviewedBy)) fail('INVALID_STATE');
            const at=new Date().toISOString();
            let updated:AiDraft|null;
            if(input.action==='draft.approve') {
              await authorizeWrite(latest);
              if(parsed.targetRecordId!==latest.targetRecordId||parsed.targetVersionToken!==latest.targetVersionToken) fail('VERSION_CONFLICT',412);
              const {target,provenanceIds}=await fresh(tx,latest,true);
              if(!await new PostgresDraftAssuranceRepository(tx).consume(binding(latest),input.assuranceToken??'')) fail('ASSURANCE_REQUIRED',403);
              const version=await appendAiHandoffVersion(tx,{tenantId,recordId:target.recordId,patientId:target.patientId,encounterId:target.encounterId,
                expectedVersion:target.recordVersion,expectedToken:target.versionToken,draftId:latest.id,actorId,content:latest.content});
              updated=await repository.transition({tenantId,draftId:latest.id,expectedVersion:expected,from:'REVIEWING',to:'APPROVED',actorId,at});
              if(!updated) fail('VERSION_CONFLICT',412);
              const auditEventId=await audit(tx,'draft.approve',updated,operation.operationId,{reviewedVersionToken:`"${expected}"`,targetRecordId:target.recordId,
                targetVersionToken:target.versionToken,provenanceIds:JSON.stringify(provenanceIds)});
              await new PostgresDraftHandoffRepository(tx).append({tenantId,draftId:latest.id,operationId:operation.operationId,...version,
                approvedDraftVersionToken:`"${expected}"`,auditEventId});
              await audit(tx,'clinical.aiHandoff',updated,operation.operationId,{recordId:version.recordId,recordVersionId:version.recordVersionId,
                recordVersionToken:version.recordVersionToken,approvedDraftVersionToken:`"${expected}"`});
            } else {
              if(input.action!=='draft.reject') await fresh(tx,latest);
              updated=input.action==='draft.edit'
                ?await repository.edit({tenantId,draftId:latest.id,expectedVersion:expected,content:parsed.content as AiDraft['content']})
                :await repository.transition({tenantId,draftId:latest.id,expectedVersion:expected,from:latest.status,
                  to:input.action==='draft.review'?'REVIEWING':'REJECTED',actorId,at});
              if(!updated) fail('VERSION_CONFLICT',412);
              await audit(tx,input.action,updated,operation.operationId,{previousVersionToken:`"${expected}"`,targetRecordId:latest.targetRecordId!});
            }
            return new PostgresOperationStore(tx).complete(operation,{resultResourceType:'AI_DRAFT',resultResourceId:latest.id,resultResourceVersion:updated.version,resultHttpStatus:200});
          });
          return {receipt:await receipt(settled),replayed:false};
        } catch(error) {
          if(error instanceof PatientCommandError) await operations.fail(operation,{failureCode:error.code,resultHttpStatus:error.status});
          throw error;
        }
      },
    };
  }};
}
