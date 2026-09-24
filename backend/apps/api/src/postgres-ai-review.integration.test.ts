import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase,createPostgresMigrationDatabase,loadMigrationFiles,runMigrations } from '../../../libs/platform/database/src/index.ts';
import { MandatoryAuditError } from '../../../libs/platform/audit/src/mandatory-audit.ts';
import { PostgresAiDraftRepository } from '../../../libs/ai/data-access/src/index.ts';
import { createAiDraftGenerationRuntime,type DraftGenerationConfiguration } from './ai-draft-generation.ts';
import { createAiDraftReviewRuntime,type DraftHumanAction,type DraftHumanPolicy,type DraftMfaVerifier } from './ai-draft-review.ts';
import { draftFixture } from './ai-draft-fixture.ts';
import { PostgresSessionRepository } from '../../../libs/identity/data-access/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';

test('Phase 6 Run 3 PostgreSQL human review, assurance, exact-version approval and Clinical handoff', {skip:!process.env.DATABASE_URL},async t=>{
  const url=process.env.DATABASE_URL!;
  if(process.env.VIORA_DISPOSABLE_DATABASE!=='1'||new URL(url).pathname!=='/viora_mobile_test') throw new Error('Requires disposable viora_mobile_test');
  const migrations=createPostgresMigrationDatabase(url);
  try {await runMigrations(migrations,await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations',import.meta.url))));}
  finally {await migrations.close();}
  const db=createPostgresDatabase(url);
  try {
    const f=await draftFixture(db),{tenantId,userId,patientId,encounterId}=f;
    const recordId=randomUUID(),sourceId=randomUUID();
    await db.query("INSERT INTO medical_records(id,tenant_id,patient_id,encounter_id,status,current_version,created_at,updated_at) VALUES($1,$2,$3,$4,'DRAFT',1,now(),now())",[recordId,tenantId,patientId,encounterId]);
    await db.query("INSERT INTO medical_record_versions(id,tenant_id,medical_record_id,version,diagnosis,symptoms,clinical_notes,treatment_plan,created_by,created_at) VALUES($1,$2,$3,1,'Synthetic diagnosis','Synthetic symptoms','Synthetic notes','Synthetic plan',$4,now())",[sourceId,tenantId,recordId,userId]);
    const content={diagnosis:'AI diagnosis',symptoms:'AI symptoms',clinicalNotes:'AI notes',treatmentPlan:'AI plan'};
    const config:DraftGenerationConfiguration={allows:()=>true,providerId:'synthetic',modelVersion:'synthetic',templateId:'test',templateVersion:'1',policyVersion:'synthetic-only',instruction:'Draft.',draftLifetimeMs:600_000,
      provider:{async complete(){return {text:JSON.stringify(content),providerRequestId:null,providerConversationId:null};}}};
    const permissions=new Set(['record.read','record.edit','draft.generate','draft.read','draft.review','draft.edit','draft.reject','draft.approve']);
    const request={context:f.context,identity:f.identity,permissions};
    // Synthetic server policy/MFA adapter exercise mechanics, not role assignment
    // or acceptance of unverified client OIDC claims in production.
    const policy:DraftHumanPolicy={allows:()=>true,canEditRecord:()=>true};
    const verifier:DraftMfaVerifier=async(_proof,binding)=>({...binding,authenticatedAt:new Date().toISOString()});
    const options={policy,verifyMfa:verifier};
    const runtime=createAiDraftReviewRuntime(db,options),bound=runtime.bind(request);
    const secondUser=randomUUID(),secondMembership=randomUUID(),secondSession=randomUUID();
    await db.query("INSERT INTO users(id,status,created_at,updated_at) VALUES($1,'ACTIVE',now(),now())",[secondUser]);
    await db.query("INSERT INTO identity_subjects(issuer,subject,user_id,created_at) VALUES('https://synthetic.example.test',$1::text,$1::uuid,now())",[secondUser]);
    await db.query("INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'DOCTOR','ACTIVE',now(),now())",[secondMembership,secondUser,tenantId]);
    await db.query("INSERT INTO patient_care_access(id,tenant_id,patient_id,membership_id,kind,created_by_membership_id) VALUES($1,$2,$3,$4,'DOCTOR_RELATIONSHIP',$4)",[randomUUID(),tenantId,patientId,secondMembership]);
    await new PostgresSessionRepository(db).create({sessionId:secondSession,userId:secondUser,identityIssuer:'https://synthetic.example.test',identitySubject:secondUser,
      accessTokenHash:'33'.repeat(32),refreshTokenHash:'44'.repeat(32),familyId:randomUUID(),refreshTokenId:randomUUID(),createdAt:new Date().toISOString(),
      accessExpiresAt:f.identity.accessExpiresAt,expiresAt:f.identity.expiresAt});
    const secondContext=createAuthenticatedRequestContext({requestId:randomUUID(),correlationId:randomUUID(),userId:secondUser,subject:secondUser,
      tenantId,membershipId:secondMembership,permissionRevision:'"1"',roles:['DOCTOR']});
    const second=runtime.bind({context:secondContext,identity:{...f.identity,sessionId:secondSession,userId:secondUser,subject:{issuer:'https://synthetic.example.test',subject:secondUser}},permissions});
    const generator=createAiDraftGenerationRuntime(db,{configuration:config}).bind(request);
    const repo=new PostgresAiDraftRepository(db);
    const targetToken=async()=>String((await db.query('SELECT version_token FROM medical_records WHERE id=$1',[recordId])).rows[0].version_token);
    const generate=async()=> (await generator.generate({body:{targetRecordId:recordId,targetVersionToken:await targetToken(),instruction:null},key:randomUUID(),timestamp:new Date().toISOString()})).receipt.primary.id;
    const command=(draftId:string,action:Exclude<DraftHumanAction,'draft.read'>,version:string,body:unknown={})=>({draftId,action,ifMatch:version,body,key:randomUUID(),timestamp:new Date().toISOString()});
    const review=async(draftId:string)=>bound.command(command(draftId,'draft.review','"1"'));
    const grant=async(draftId:string,version='"2"')=>(await bound.issueAssurance({draftId,ifMatch:version,proof:'server-verified-synthetic'})).assuranceToken;
    const approve=async(draftId:string,token:string,version='"2"')=>({...command(draftId,'draft.approve',version,{targetRecordId:recordId,targetVersionToken:await targetToken()}),assuranceToken:token});
    const state=async(draftId:string)=>{
      const d=await repo.findById({tenantId,draftId});
      const target=(await db.query('SELECT current_version,status,version_token FROM medical_records WHERE id=$1',[recordId])).rows[0];
      const h=(await db.query('SELECT id FROM ai_handoffs WHERE tenant_id=$1 AND draft_id=$2',[tenantId,draftId])).rows.length;
      return {version:d!.version,status:d!.status,target,h};
    };
    await t.test('human review atomically records reviewer, exact requested version and mandatory audit',async()=>{
      const id=await generate();const result=await review(id);
      assert.equal(result.receipt.primary.versionToken,'"2"');
      const draft=await bound.read(id); assert.equal(draft.reviewedBy,userId);assert.equal(draft.status,'REVIEWING');
      assert.equal(draft.provenance[0].sourceId,sourceId);
      const event=(await db.query("SELECT * FROM audit_events WHERE tenant_id=$1 AND resource_id=$2 AND action='draft.review'",[tenantId,id])).rows[0];
      assert.equal(event.actor_id,userId);assert.equal(event.session_id,f.identity.sessionId);assert.equal(event.resource_version,'2');
      assert.equal((event.metadata as Record<string,string>).previousVersionToken,'"1"');
      await assert.rejects(review(id),/VERSION_CONFLICT/);
    });
    await t.test('two concurrent human review commands have one valid winner',async()=>{
      const id=await generate();const results=await Promise.allSettled([review(id),second.command(command(id,'draft.review','"1"'))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await state(id)).version,2n);
    });
    await t.test('missing/expired authentication, AI actor, missing capabilities and governance deny',async()=>{
      const id=await generate(),before=await state(id);
      assert.throws(()=>runtime.bind({...request,context:{...f.context,actor:null}}),/UNAUTHENTICATED/);
      assert.throws(()=>runtime.bind({...request,identity:{...f.identity,accessExpiresAt:'2000-01-01'}}),/UNAUTHENTICATED/);
      for(const altered of [{...request,permissions:new Set(['record.read'])},
        {...request,context:{...f.context,actor:{...f.context.actor!,kind:'AI' as const}}},
        {...request,context:{...f.context,tenant:{...f.context.tenant!,roles:['CLINIC_ADMIN']}}}]) {
        await assert.rejects(runtime.bind(altered).command(command(id,'draft.review','"1"')));
      }
      await assert.rejects(createAiDraftReviewRuntime(db,{}).bind(request).command(command(id,'draft.review','"1"')),/FORBIDDEN/);
      assert.deepEqual(await state(id),before);
    });
    await t.test('revoked session and workspace revision deny before mutation',async()=>{
      const id=await generate();
      await db.query("UPDATE sessions SET status='REVOKED' WHERE id=$1",[f.identity.sessionId]);
      try {await assert.rejects(review(id),/UNAUTHENTICATED/);} finally {await db.query("UPDATE sessions SET status='ACTIVE' WHERE id=$1",[f.identity.sessionId]);}
      await assert.rejects(runtime.bind({...request,context:{...f.context,tenant:{...f.context.tenant!,permissionRevision:'"2"'}}}).command(command(id,'draft.review','"1"')),/UNAUTHENTICATED/);
      assert.equal((await state(id)).version,1n);
    });
    await t.test('cross-tenant and absent IDs are non-disclosing; wrong patient/encounter relationships deny',async()=>{
      const id=await generate();
      const other=await draftFixture(db);
      const outsider=runtime.bind({context:other.context,identity:other.identity,permissions});
      for(const draftId of [id,randomUUID()]) await assert.rejects(outsider.command(command(draftId,'draft.review','"1"')),/RESOURCE_NOT_FOUND/);
      await db.query('UPDATE ai_drafts SET patient_id=$2 WHERE id=$1',[id,f.deniedPatient]);
      try {await assert.rejects(review(id),/RESOURCE_NOT_FOUND/);} finally {await db.query('UPDATE ai_drafts SET patient_id=$2 WHERE id=$1',[id,patientId]);}
      await db.query('UPDATE ai_drafts SET encounter_id=NULL WHERE id=$1',[id]);
      try {await assert.rejects(review(id),/RESOURCE_NOT_FOUND/);} finally {await db.query('UPDATE ai_drafts SET encounter_id=$2 WHERE id=$1',[id,encounterId]);}
    });
    await t.test('rejection is exact-version human terminal action with no handoff',async()=>{
      const id=await generate();await review(id);
      await bound.command(command(id,'draft.reject','"2"',{reason:null}));
      assert.equal((await state(id)).status,'REJECTED');assert.equal((await state(id)).h,0);
      assert.equal((await repo.findById({tenantId,draftId:id}))!.rejectedBy,userId);
      await assert.rejects(bound.command(command(id,'draft.reject','"3"',{reason:null})),/INVALID_STATE/);
      await assert.rejects(bound.issueAssurance({draftId:id,ifMatch:'"3"',proof:null}),/INVALID_STATE/);
    });
    await t.test('unreviewed draft cannot obtain approval assurance or handoff',async()=>{
      const id=await generate();
      await assert.rejects(bound.issueAssurance({draftId:id,ifMatch:'"1"',proof:null}),/INVALID_STATE/);
      await assert.rejects(bound.command(await approve(id,'forged','"1"')),/INVALID_STATE/);
      assert.equal((await state(id)).h,0);
    });
    await t.test('MFA must be configured, fresh and bound to this actor/session/draft/version/target',async()=>{
      const id=await generate();await review(id);
      await assert.rejects(createAiDraftReviewRuntime(db,{policy}).bind(request).issueAssurance({draftId:id,ifMatch:'"2"',proof:null}),/ASSURANCE_REQUIRED/);
      for(const change of [{authenticatedAt:'2000-01-01'},{sessionId:randomUUID()},{draftVersion:1n},{targetVersionToken:'"other"'}]) {
        const verifyMfa:DraftMfaVerifier=async(_proof,binding)=>({...binding,authenticatedAt:new Date().toISOString(),...change});
        await assert.rejects(createAiDraftReviewRuntime(db,{policy,verifyMfa}).bind(request).issueAssurance({draftId:id,ifMatch:'"2"',proof:null}),/ASSURANCE_REQUIRED/);
      }
      await assert.rejects(bound.command(await approve(id,'forged')),/ASSURANCE_REQUIRED/);
    });
    await t.test('edit invalidates old reviewed token and old assurance; fresh exact version can hand off',async()=>{
      const id=await generate();await review(id);const old=await grant(id);
      const edited={...content,clinicalNotes:'Human corrected notes'};
      await bound.command(command(id,'draft.edit','"2"',{content:edited}));
      await assert.rejects(bound.command(await approve(id,old)),/VERSION_CONFLICT/);
      await assert.rejects(bound.command(await approve(id,old,'"3"')),/ASSURANCE_REQUIRED/);
      const token=await grant(id,'"3"');const input=await approve(id,token,'"3"');
      const result=await bound.command(input);const handoff=result.receipt.handoff;assert.ok(handoff);
      assert.equal(result.receipt.primary.versionToken,'"4"');assert.equal(handoff.approvedDraftVersionToken,'"3"');
      const version=(await db.query('SELECT * FROM medical_record_versions WHERE id=$1',[handoff.recordVersionId])).rows[0];
      assert.equal(version.clinical_notes,edited.clinicalNotes);assert.equal(version.created_by,userId);assert.equal(version.source_ai_draft_id,id);
      assert.equal((await state(id)).target.status,'DRAFT');assert.equal((await state(id)).status,'APPROVED');
      assert.deepEqual((await bound.command({...input,assuranceToken:undefined})).receipt,result.receipt);
      assert.equal((await state(id)).h,1);
      assert.equal((await db.query('SELECT consumed_at FROM draft_assurance_grants WHERE draft_id=$1 AND draft_version=3',[id])).rows[0].consumed_at instanceof Date,true);
    });
    await t.test('approval requires independent record.edit permission and Clinical write policy',async()=>{
      const id=await generate();await review(id);const token=await grant(id),input=await approve(id,token);
      await assert.rejects(runtime.bind({...request,permissions:new Set([...permissions].filter(p=>p!=='record.edit'))}).command(input),/FORBIDDEN/);
      await assert.rejects(createAiDraftReviewRuntime(db,{...options,policy:{...policy,canEditRecord:()=>false}}).bind(request).command(input),/FORBIDDEN/);
      assert.equal((await state(id)).status,'REVIEWING');
      await assert.rejects(runtime.bind({...request,context:{...f.context,actor:{...f.context.actor!,kind:'AI'}}}).command(input),/FORBIDDEN/);
    });
    await t.test('approve vs reject race produces one terminal result and at most one handoff',async()=>{
      const id=await generate();await review(id);const token=await grant(id);
      const results=await Promise.allSettled([bound.command(await approve(id,token)),bound.command(command(id,'draft.reject','"2"',{reason:null}))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const final=await state(id);assert.equal(final.version,3n);assert.ok(['APPROVED','REJECTED'].includes(final.status));
      assert.equal(final.h,final.status==='APPROVED'?1:0);
    });
    await t.test('duplicate approval operations and different-key races create one handoff/version',async()=>{
      const id=await generate();await review(id);const token=await grant(id),first=await approve(id,token);
      const results=await Promise.allSettled([bound.command(first),bound.command({...first,key:randomUUID()})]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await state(id)).h,1);
      const succeeded=results.find(r=>r.status==='fulfilled')!;assert.ok(succeeded.status==='fulfilled');
      const winningKey=succeeded.value.receipt.operationId;
      assert.deepEqual((await bound.command({...first,key:winningKey,assuranceToken:undefined})).receipt,succeeded.value.receipt);
    });
    for(const table of ['ai_handoffs','audit_events']) await t.test(`${table} rejection rolls back approval, Clinical version, assurance consumption and operation completion`,async()=>{
      const id=await generate();await review(id);const token=await grant(id),before=await state(id);
      await db.query(`CREATE FUNCTION run3_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        ${table==='audit_events'?"IF NEW.action <> 'clinical.aiHandoff' THEN RETURN NEW; END IF;":''}
        RAISE EXCEPTION 'Synthetic Run 3 write failure'; END $$`);
      await db.query(`CREATE TRIGGER run3_reject_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION run3_reject_write()`);
      const input=await approve(id,token);
      try {await assert.rejects(bound.command(input),table==='audit_events'?MandatoryAuditError:/Synthetic Run 3 write failure/);}
      finally {await db.query(`DROP TRIGGER run3_reject_write ON ${table}`);await db.query('DROP FUNCTION run3_reject_write()');}
      assert.deepEqual(await state(id),before);
      assert.equal((await db.query('SELECT consumed_at FROM draft_assurance_grants WHERE draft_id=$1',[id])).rows[0].consumed_at,null);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM medical_record_versions WHERE source_ai_draft_id=$1',[id])).rows[0].count,0);
      assert.equal((await db.query('SELECT status FROM operations WHERE tenant_id=$1 AND idempotency_key=$2',[tenantId,input.key])).rows[0].status,'PROCESSING');
    });
    await t.test('stale target, wrong target body and provenance corruption block handoff',async()=>{
      const id=await generate();await review(id);const token=await grant(id),input=await approve(id,token);
      await assert.rejects(bound.command({...input,body:{...input.body as object,targetRecordId:randomUUID()}}),/VERSION_CONFLICT/);
      const old=await targetToken();await db.query("UPDATE medical_records SET version_token='\"changed\"' WHERE id=$1",[recordId]);
      try {await assert.rejects(bound.command({...input,key:randomUUID()}),/VERSION_CONFLICT/);} finally {await db.query('UPDATE medical_records SET version_token=$2 WHERE id=$1',[recordId,old]);}
      await db.query("UPDATE ai_provenance SET source_reference=$2 WHERE draft_id=$1",[id,randomUUID()]);
      await assert.rejects(bound.command({...input,key:randomUUID()}),/PROVENANCE_CONFLICT/);
      assert.equal((await state(id)).h,0);assert.equal((await state(id)).status,'REVIEWING');
    });
    await t.test('review and rejection audit failures roll back their version transitions',async()=>{
      const id=await generate(),rejectId=await generate();await review(rejectId);
      await db.query("CREATE FUNCTION run3_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('draft.review','draft.reject') THEN RAISE EXCEPTION 'Synthetic audit'; END IF; RETURN NEW; END $$");
      await db.query('CREATE TRIGGER run3_review_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION run3_review_audit()');
      try {
        await assert.rejects(review(id),MandatoryAuditError);assert.equal((await state(id)).version,1n);
        await assert.rejects(bound.command(command(rejectId,'draft.reject','"2"',{reason:null})),MandatoryAuditError);
        assert.equal((await state(rejectId)).version,2n);assert.equal((await state(rejectId)).status,'REVIEWING');
      }
      finally {await db.query('DROP TRIGGER run3_review_audit ON audit_events');await db.query('DROP FUNCTION run3_review_audit()');}
    });
    await t.test('bigint review and approval bind exact tokens beyond Number precision',async()=>{
      const id=await generate();await db.query('UPDATE ai_drafts SET version=$2 WHERE id=$1',[id,'9007199254740993']);
      const reviewed=await bound.command(command(id,'draft.review','"9007199254740993"'));
      assert.equal(reviewed.receipt.primary.versionToken,'"9007199254740994"');
      const token=await grant(id,'"9007199254740994"');
      const approved=await bound.command(await approve(id,token,'"9007199254740994"'));
      assert.equal(approved.receipt.primary.versionToken,'"9007199254740995"');
      assert.equal(approved.receipt.handoff!.approvedDraftVersionToken,'"9007199254740994"');
    });
    await t.test('two drafts targeting the same record cannot both hand off the old target version',async()=>{
      const a=await generate(),b=await generate();await review(a);await review(b);
      const first=await approve(a,await grant(a)),secondInput=await approve(b,await grant(b));
      const results=await Promise.allSettled([bound.command(first),bound.command(secondInput)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await state(a)).h+(await state(b)).h,1);
    });
    await t.test('expired draft and expired/session-mismatched assurance cannot approve',async()=>{
      const id=await generate();await review(id);const token=await grant(id);
      await assert.rejects(second.command(await approve(id,token)),/ASSURANCE_REQUIRED/);
      await db.query("UPDATE draft_assurance_grants SET created_at=now()-interval '3 minutes',expires_at=now()-interval '1 minute' WHERE draft_id=$1",[id]);
      await assert.rejects(bound.command(await approve(id,token)),/ASSURANCE_REQUIRED/);
      await db.query("UPDATE ai_drafts SET expires_at=now()-interval '1 minute' WHERE id=$1",[id]);
      await assert.rejects(bound.read(id),/RESOURCE_EXPIRED/);
      await assert.rejects(bound.command(await approve(id,token)),/RESOURCE_EXPIRED/);
      assert.equal((await state(id)).h,0);
    });
    await t.test('audit and operation metadata never contain Clinical payloads or assurance secrets',async()=>{
      const rows=(await db.query('SELECT metadata FROM audit_events WHERE tenant_id=$1',[tenantId])).rows;
      const serialized=JSON.stringify(rows);
      for(const secret of ['AI notes','Human corrected notes','Synthetic diagnosis','server-verified-synthetic']) assert.equal(serialized.includes(secret),false);
      const grants=(await db.query('SELECT token_hash FROM draft_assurance_grants WHERE tenant_id=$1',[tenantId])).rows;
      assert.ok(grants.length>0);assert.ok(grants.every(row=>Buffer.isBuffer(row.token_hash)&&row.token_hash.length===32));
    });
  } finally {await db.close();}
});
