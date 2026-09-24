import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations } from '../../../libs/platform/database/src/index.ts';
import { PostgresAiDraftRepository } from '../../../libs/ai/data-access/src/index.ts';
import { PostgresDraftProvenanceRepository } from '../../../libs/ai/data-access/src/draft-provenance.ts';
import { MandatoryAuditError } from '../../../libs/platform/audit/src/mandatory-audit.ts';
import { createAiDraftGenerationRuntime, type DraftGenerationConfiguration } from './ai-draft-generation.ts';
import { draftFixture } from './ai-draft-fixture.ts';

test('Phase 6 Run 2 PostgreSQL durable draft/provenance/audit, authorization, rollback and OCC', {skip:!process.env.DATABASE_URL}, async t => {
  const url=process.env.DATABASE_URL!;
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1' || new URL(url).pathname !== '/viora_mobile_test') throw new Error('Requires disposable viora_mobile_test');
  const migrations=createPostgresMigrationDatabase(url);
  try { await runMigrations(migrations,await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations',import.meta.url)))); }
  finally { await migrations.close(); }
  const db=createPostgresDatabase(url);
  try {
    // Committed synthetic fixtures allow separate pool connections to race.
    // Existing suite resets this explicitly disposable database between groups.
    const f=await draftFixture(db);
    const {tenantId,otherTenant,userId,patientId,encounterId}=f;
    const recordId=randomUUID(),sourceId=randomUUID();
    await db.query("INSERT INTO medical_records(id,tenant_id,patient_id,encounter_id,status,current_version,created_at,updated_at) VALUES($1,$2,$3,$4,'DRAFT',1,now(),now())",[recordId,tenantId,patientId,encounterId]);
    await db.query("INSERT INTO medical_record_versions(id,tenant_id,medical_record_id,version,diagnosis,symptoms,clinical_notes,treatment_plan,created_by,created_at) VALUES($1,$2,$3,1,'Synthetic source diagnosis','Synthetic source symptoms','Synthetic source notes','Synthetic source plan',$4,now())",[sourceId,tenantId,recordId,userId]);
    const output={diagnosis:'Synthetic output diagnosis',symptoms:'Synthetic output symptoms',clinicalNotes:'Synthetic output notes',treatmentPlan:'Synthetic output plan'};
    const prompts:string[]=[];
    const configuration:DraftGenerationConfiguration={allows:()=>true,providerId:'synthetic',modelVersion:'synthetic-1',templateId:'draft',templateVersion:'1',policyVersion:'synthetic-only',instruction:'Prepare a draft.',draftLifetimeMs:60_000,
      provider:{async complete(input){prompts.push(input.prompt);return {text:JSON.stringify(output),providerRequestId:null,providerConversationId:null};}}};
    const request={context:f.context,identity:f.identity,permissions:new Set(['draft.generate','record.read'])};
    const bound=createAiDraftGenerationRuntime(db,{configuration}).bind(request);
    const command=()=>({body:{targetRecordId:recordId,targetVersionToken:'"v1"',instruction:null},key:randomUUID(),timestamp:new Date().toISOString()});
    const repository=new PostgresAiDraftRepository(db);
    const counts=async()=>{
      const row=(await db.query(`SELECT (SELECT count(*) FROM ai_drafts WHERE tenant_id=$1)::int AS drafts,
        (SELECT count(*) FROM ai_provenance WHERE tenant_id=$1)::int AS provenance,
        (SELECT count(*) FROM audit_events WHERE tenant_id=$1 AND action='ai.generation')::int AS audits`,[tenantId])).rows[0];
      return row;
    };
    let draftId='';
    await t.test('durable generation binds canonical actor, patient, encounter, target, source, expiry and version',async()=>{
      const result=await bound.generate(command()); draftId=result.receipt.primary.id;
      assert.equal(result.receipt.primary.versionToken,'"1"');
      const draft=await repository.findById({tenantId,draftId}); assert.ok(draft);
      assert.deepEqual(draft.content,output); assert.equal(draft.createdBy,userId); assert.equal(draft.patientId,patientId);
      assert.equal(draft.encounterId,encounterId); assert.equal(draft.targetRecordId,recordId);
      assert.equal(draft.targetVersionToken,'"v1"'); assert.equal(draft.status,'GENERATED'); assert.equal(draft.version,1n);
      assert.ok(Date.parse(draft.expiresAt!)>Date.now()); assert.equal(draft.approvedBy,null);
      const provenance=(await db.query('SELECT * FROM ai_provenance WHERE tenant_id=$1 AND draft_id=$2',[tenantId,draftId])).rows;
      assert.equal(provenance.length,1); assert.equal(provenance[0].source_type,'RECORD_VERSION');
      assert.equal(provenance[0].source_reference,sourceId); assert.equal(provenance[0].target_record_version,'1');
      assert.equal((provenance[0].metadata as Record<string,string>).sourceVersion,'"v1"');
      assert.equal((provenance[0].metadata as Record<string,string>).draftVersion,'1');
      const audits=(await db.query("SELECT * FROM audit_events WHERE tenant_id=$1 AND action='ai.generation'",[tenantId])).rows;
      assert.equal(audits.length,1); assert.equal(audits[0].actor_id,userId); assert.equal(audits[0].session_id,f.identity.sessionId);
      assert.equal(audits[0].resource_version,'1'); assert.ok(audits[0].operation_id);
      assert.equal(JSON.stringify(audits).includes('Synthetic output'),false);
      assert.equal(prompts[0].includes('INTERNAL_'),false);
      assert.equal((await db.query('SELECT current_version,status FROM medical_records WHERE id=$1',[recordId])).rows[0].status,'DRAFT');
      assert.equal((await db.query('SELECT id FROM ai_handoffs WHERE tenant_id=$1',[tenantId])).rows.length,0);
    });
    await t.test('same operation replays exact receipt without another provider call or draft',async()=>{
      const input=command(); const first=await bound.generate(input); const before=prompts.length;
      assert.deepEqual((await bound.generate(input)).receipt,first.receipt); assert.equal(prompts.length,before);
      await assert.rejects(bound.generate({...input,body:{...input.body,instruction:'changed'}}),/IDEMPOTENCY_CONFLICT/);
      await db.query("UPDATE medical_records SET version_token='\"later\"' WHERE id=$1",[recordId]);
      try { assert.deepEqual((await bound.generate(input)).receipt,first.receipt); }
      finally { await db.query("UPDATE medical_records SET version_token='\"v1\"' WHERE id=$1",[recordId]); }
    });
    await t.test('missing governance/grants and unauthorized resources persist no output',async()=>{
      const before=await counts(),calls=prompts.length;
      await assert.rejects(createAiDraftGenerationRuntime(db,{}).bind(request).generate(command()),/FEATURE_UNAVAILABLE/);
      for (const permissions of [new Set(['record.read']),new Set(['draft.generate'])]) {
        await assert.rejects(createAiDraftGenerationRuntime(db,{configuration}).bind({...request,permissions}).generate(command()));
      }
      for (const context of [{...f.context,tenant:{...f.context.tenant!,roles:['CLINIC_ADMIN']}},
        {...f.context,tenant:{...f.context.tenant!,tenantId:otherTenant}}]) {
        await assert.rejects(createAiDraftGenerationRuntime(db,{configuration}).bind({...request,context}).generate(command()));
      }
      await assert.rejects(bound.generate({...command(),body:{targetRecordId:randomUUID(),targetVersionToken:'"v1"',instruction:null}}));
      assert.deepEqual(await counts(),before); assert.equal(prompts.length,calls);
    });
    await t.test('target precondition and patient/encounter mismatch fail before provider',async()=>{
      const before=prompts.length;
      await assert.rejects(bound.generate({...command(),body:{targetRecordId:recordId,targetVersionToken:'"stale"',instruction:null}}),/VERSION_CONFLICT/);
      await db.query('UPDATE medical_records SET patient_id=$2 WHERE id=$1',[recordId,f.deniedPatient]);
      try { await assert.rejects(bound.generate(command())); } finally { await db.query('UPDATE medical_records SET patient_id=$2 WHERE id=$1',[recordId,patientId]); }
      assert.equal(prompts.length,before);
    });
    await t.test('target changes during generation cannot commit stale draft',async()=>{
      const before=await counts();
      const changing={...configuration,provider:{async complete(){await db.query("UPDATE medical_records SET version_token='\"v2\"' WHERE id=$1",[recordId]);return {text:JSON.stringify(output),providerRequestId:null,providerConversationId:null};}}};
      try { await assert.rejects(createAiDraftGenerationRuntime(db,{configuration:changing}).bind(request).generate(command()),/VERSION_CONFLICT/); }
      finally { await db.query("UPDATE medical_records SET version_token='\"v1\"' WHERE id=$1",[recordId]); }
      assert.deepEqual(await counts(),before);
    });
    await t.test('invalid provider payload never persists',async()=>{
      const before=await counts();
      const invalid={...configuration,provider:{async complete(){return {text:'{"createdBy":"forged"}',providerRequestId:null,providerConversationId:null};}}};
      await assert.rejects(createAiDraftGenerationRuntime(db,{configuration:invalid}).bind(request).generate(command()),/AI_OUTPUT_REJECTED/);
      assert.deepEqual(await counts(),before);
    });
    for (const table of ['ai_provenance','audit_events']) await t.test(`${table} failure rolls back draft, provenance and completed operation`,async()=>{
      const before=await counts();
      await db.query(`CREATE FUNCTION run2_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        ${table==='audit_events' ? "IF NEW.action <> 'ai.generation' THEN RETURN NEW; END IF;" : ''}
        RAISE EXCEPTION 'Synthetic Run 2 write failure'; END $$`);
      await db.query(`CREATE TRIGGER run2_reject_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION run2_reject_write()`);
      const input=command();
      try { await assert.rejects(bound.generate(input),table==='audit_events'?MandatoryAuditError:/Synthetic Run 2 write failure/); }
      finally { await db.query(`DROP TRIGGER run2_reject_write ON ${table}`); await db.query('DROP FUNCTION run2_reject_write()'); }
      assert.deepEqual(await counts(),before);
      assert.equal((await db.query('SELECT status FROM operations WHERE tenant_id=$1 AND idempotency_key=$2',[tenantId,input.key])).rows[0].status,'PROCESSING');
    });
    await t.test('provenance rejects mismatched source and target relationships',async()=>{
      const provenance=new PostgresDraftProvenanceRepository(db);
      const target=await provenance.target(tenantId,recordId); assert.ok(target);
      await assert.rejects(provenance.append({tenantId,draftId,target:{...target,sourceId:randomUUID()},metadata:{}}),/PROVENANCE_BINDING_CONFLICT/);
      await assert.rejects(provenance.append({tenantId:otherTenant,draftId,target,metadata:{}}),/PROVENANCE_BINDING_CONFLICT/);
      await assert.rejects(db.query(`INSERT INTO ai_provenance(id,tenant_id,draft_id,target_record_id,target_record_version,target_version_token,ordinal,source_type,source_reference,created_at)
        VALUES($1,$2,$3,$4,1,'"v1"',1,'RECORD_VERSION',$5,now())`,[randomUUID(),otherTenant,draftId,recordId,sourceId]),/foreign key/);
    });
    const transition={tenantId,draftId,from:'GENERATED' as const,to:'REVIEWING' as const,expectedVersion:1n,actorId:userId,at:new Date().toISOString()};
    await t.test('wrong tenant and missing draft are indistinguishable; state/version predicates are atomic',async()=>{
      assert.equal(await repository.findById({tenantId:otherTenant,draftId}),null);
      for (const input of [{...transition,tenantId:otherTenant},{...transition,draftId:randomUUID()},
        {...transition,expectedVersion:2n},{...transition,from:'REVIEWING' as const}]) assert.equal(await repository.transition(input),null);
    });
    await t.test('real concurrent PostgreSQL updates have one winner and increment once',async()=>{
      const results=await Promise.all([repository.transition(transition),repository.transition(transition)]);
      assert.equal(results.filter(Boolean).length,1); assert.equal(results.find(Boolean)!.version,2n);
      assert.equal(await repository.transition(transition),null);
    });
    await t.test('bigint version precision survives persistence, reads and transitions',async()=>{
      await db.query('UPDATE ai_drafts SET version=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,draftId,'9007199254740993']);
      assert.equal((await repository.findById({tenantId,draftId}))!.version,9007199254740993n);
      const updated=await repository.transition({...transition,from:'REVIEWING',to:'REJECTED',expectedVersion:9007199254740993n});
      assert.equal(updated!.version,9007199254740994n);
      assert.equal(await repository.transition({...transition,from:'REVIEWING',to:'REJECTED',expectedVersion:9007199254740993n}),null);
    });
  } finally { await db.close(); }
});
