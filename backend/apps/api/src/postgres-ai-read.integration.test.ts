import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations, type TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { MandatoryAuditError } from '../../../libs/platform/audit/src/mandatory-audit.ts';
import { PostgresSessionRepository } from '../../../libs/identity/data-access/src/index.ts';
import { PostgresKnowledgeChunkRepository } from '../../../libs/ai/data-access/src/index.ts';
import { createAiReadRuntime, type AiReadRequestIdentity } from './ai-read-composition.ts';
import type { SummaryConfiguration } from './ai-summary.ts';

test('Phase 6 Run 1 real PostgreSQL authorized reads, retrieval, summary and audit', { skip: !process.env.DATABASE_URL }, async t => {
  const url = process.env.DATABASE_URL!;
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1' || new URL(url).pathname !== '/viora_mobile_test') throw new Error('Requires disposable viora_mobile_test');
  const migration = createPostgresMigrationDatabase(url);
  try { await runMigrations(migration, await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations', import.meta.url)))); }
  finally { await migration.close(); }
  const database = createPostgresDatabase(url);
  const rollback = new Error('synthetic fixture rollback');
  try {
    await assert.rejects(database.transaction(async tx => {
      const db: TransactionalDatabase = { ...tx, transaction: async work => work(tx), close: async () => {} };
      const tenantId = randomUUID(), otherTenant = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
      const patientId = randomUUID(), otherPatient = randomUUID(), deniedPatient = randomUUID(), encounterId = randomUUID();
      const doctorId = randomUUID(), departmentId = randomUUID(), locationId = randomUUID();
      await tx.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Synthetic A','ACTIVE',now(),now()),($2,'Synthetic B','ACTIVE',now(),now())", [tenantId,otherTenant]);
      await tx.query("INSERT INTO users(id,status,created_at,updated_at) VALUES($1,'ACTIVE',now(),now())", [userId]);
      await tx.query("INSERT INTO identity_subjects(issuer,subject,user_id,created_at) VALUES('https://synthetic.example.test','fixture',$1,now())", [userId]);
      await tx.query("INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'DOCTOR','ACTIVE',now(),now())", [membershipId,userId,tenantId]);
      for (const [id, tenant] of [[patientId,tenantId],[deniedPatient,tenantId],[otherPatient,otherTenant]]) {
        await tx.query("INSERT INTO patients(id,tenant_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at) VALUES($1,$2,$3,'Synthetic Patient','1990-01-01','UNKNOWN','INTERNAL_PHONE','internal@example.test','INTERNAL_ADDRESS','INTERNAL_CONTACT','ACTIVE',now(),now())", [id,tenant,id]);
      }
      await tx.query("INSERT INTO patient_care_access(id,tenant_id,patient_id,membership_id,kind,created_by_membership_id) VALUES($1,$2,$3,$4,'DOCTOR_RELATIONSHIP',$4)", [randomUUID(),tenantId,patientId,membershipId]);
      await tx.query("INSERT INTO locations(id,tenant_id,name,status,created_at,updated_at) VALUES($1,$2,'Synthetic','ACTIVE',now(),now())", [locationId,tenantId]);
      await tx.query("INSERT INTO departments(id,tenant_id,name,description,status,created_at,updated_at) VALUES($1,$2,'Synthetic','Synthetic','ACTIVE',now(),now())", [departmentId,tenantId]);
      await tx.query("INSERT INTO doctors(id,tenant_id,user_id,department_id,location_id,license_number,display_name,specialization,bio,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'Synthetic','Synthetic','Synthetic','Synthetic','ACTIVE',now(),now())", [doctorId,tenantId,userId,departmentId,locationId]);
      for (const [id, patient] of [[encounterId,patientId],[randomUUID(),deniedPatient]]) await tx.query("INSERT INTO encounters(id,tenant_id,patient_id,doctor_id,started_at,status,created_at,updated_at) VALUES($1,$2,$3,$4,now(),'OPEN',now(),now())", [id,tenantId,patient,doctorId]);
      const now = new Date();
      const accessExpiresAt = new Date(now.getTime()+600_000).toISOString(), expiresAt = new Date(now.getTime()+28_800_000).toISOString();
      await new PostgresSessionRepository(db).create({ sessionId,userId,identityIssuer:'https://synthetic.example.test',identitySubject:'fixture',accessTokenHash:'11'.repeat(32),refreshTokenHash:'22'.repeat(32),familyId:randomUUID(),refreshTokenId:randomUUID(),createdAt:now.toISOString(),accessExpiresAt,expiresAt });
      const context = createAuthenticatedRequestContext({ requestId:randomUUID(),correlationId:randomUUID(),userId,subject:'fixture',tenantId,membershipId,permissionRevision:'"1"',roles:['DOCTOR'] });
      const identity = { sessionId,userId,subject:{ issuer:'https://synthetic.example.test',subject:'fixture' },accessExpiresAt,expiresAt };
      // assistant.use is canonical vocabulary; this fixture's server policy is
      // synthetic and does not establish a production role ceiling.
      const request: AiReadRequestIdentity = { context, identity, permissions:new Set(['patient.read','encounter.read','assistant.use']) };
      const chunks = new PostgresKnowledgeChunkRepository(db);
      const embedding = Array.from({length:1536},(_,index)=>index===0?1:0);
      const docs: Record<string,{ documentId:string; chunkId:string }> = {};
      for (const [key, tenant, status] of [['allowed',tenantId,'APPROVED'],['denied',tenantId,'APPROVED'],['draft',tenantId,'DRAFT'],['foreign',otherTenant,'APPROVED']]) {
        const documentId=randomUUID();
        await tx.query("INSERT INTO knowledge_documents(id,tenant_id,title,source,document_type,status,created_at,updated_at) VALUES($1,$2,$3,$3,'GUIDELINE',$4,now(),now())",[documentId,tenant,key,status]);
        const chunk = await chunks.append({ documentId,tenantId:tenant,content:`${key} synthetic evidence`,embedding,metadata:{} });
        docs[key]={documentId,chunkId:chunk.id};
      }
      const prompts:string[]=[];
      const summary:SummaryConfiguration={ allows:()=>true,providerId:'synthetic',modelVersion:'test-only',templateId:'fixture',templateVersion:'test-only',policyVersion:'synthetic-only',instruction:'Summarize authorized context.',provider:{async complete(input){prompts.push(input.prompt);return {text:'Synthetic advisory',providerRequestId:null,providerConversationId:null};}} };
      const options={cursorKey:'12'.repeat(32),policy:{allows:()=>true,canReadDocument:(_context:unknown,document:{documentId:string})=>document.documentId===docs.allowed.documentId},embeddings:{async embed(){return embedding;}},summary};
      const runtime=createAiReadRuntime(db,options);
      const bound=runtime.bind(request);
      await t.test('authorized Patient read excludes internal and contact fields',async()=>{
        const result=await bound.invokeTool({toolName:'get_patient',input:{patientId}});
        assert.equal(result.ok,true); assert.equal(JSON.stringify(result).includes('INTERNAL'),false);
      });
      await t.test('unauthorized and cross-tenant Patient reads are non-disclosing',async()=>{
        for(const id of [deniedPatient,otherPatient,randomUUID()]) assert.deepEqual(await bound.invokeTool({toolName:'get_patient',input:{patientId:id}}),{ok:false,toolName:'get_patient',reason:'TOOL_FAILURE'});
        assert.equal((await runtime.bind({...request,permissions:new Set()}).invokeTool({toolName:'get_patient',input:{patientId}})).ok,false);
      });
      await t.test('Clinical reads reuse grant, role ceiling and relationship authorization',async()=>{
        const result=await bound.invokeTool({toolName:'get_recent_encounters',input:{patientId}});
        assert.equal(result.ok,true); assert.match(JSON.stringify(result),new RegExp(encounterId));
        for(const id of [deniedPatient,otherPatient]) assert.equal((await bound.invokeTool({toolName:'get_recent_encounters',input:{patientId:id}})).ok,false);
        assert.equal((await runtime.bind({...request,permissions:new Set(['patient.read'])}).invokeTool({toolName:'get_recent_encounters',input:{patientId}})).ok,false);
        assert.equal((await runtime.bind({...request,context:{...context,tenant:{...context.tenant!,roles:['CLINIC_ADMIN']}}}).invokeTool({toolName:'get_recent_encounters',input:{patientId}})).ok,false);
      });
      await t.test('approved retrieval excludes foreign, draft and unauthorized documents and retains metadata',async()=>{
        assert.deepEqual(await bound.searchKnowledge({query:'synthetic'}),{kind:'RESULTS',results:[{...docs.allowed,title:'allowed',source:'allowed',snippet:'allowed synthetic evidence'}]});
        assert.equal((await bound.searchKnowledge({query:'synthetic',limit:21})).kind,'INVALID');
      });
      await t.test('knowledge relationship and vector constraints reject invalid writes and requests',async()=>{
        await assert.rejects(chunks.append({documentId:docs.allowed.documentId,tenantId:otherTenant,content:'invalid',embedding,metadata:{}}));
        for(const invalid of [[],[1],Array(1536).fill(NaN)]) await assert.rejects(chunks.searchByEmbedding({tenantId,embedding:invalid,limit:1}));
        await assert.rejects(chunks.searchByEmbedding({tenantId,embedding,limit:0}));
        await tx.query('SAVEPOINT invalid_chunk');
        const malformedId = randomUUID();
        // Current schema has independent FKs. Even malformed storage must not
        // bypass the repository's tenant/document join at retrieval time.
        await tx.query("INSERT INTO knowledge_chunks(id,document_id,tenant_id,content,embedding,metadata,created_at) VALUES($1,$2,$3,'invalid',$4::vector,'{}',now())",[malformedId,docs.allowed.documentId,otherTenant,`[${embedding.join(',')}]`]);
        for (const tenant of [tenantId, otherTenant]) assert.equal((await chunks.searchByEmbedding({tenantId:tenant,embedding,limit:20})).some(row=>row.id===malformedId),false);
        await tx.query('ROLLBACK TO SAVEPOINT invalid_chunk');
      });
      await t.test('summary uses only authorized context and returns transient source identities',async()=>{
        const result=await bound.summarize({patientId,query:'synthetic'}); assert.ok(result.ok);
        assert.equal(result.kind,'AI_GENERATED_ADVISORY');
        assert.deepEqual(result.provenance.sources,[{kind:'PATIENT',patientId},{kind:'ENCOUNTER',patientId,encounterId},{kind:'APPROVED_KNOWLEDGE',...docs.allowed}]);
        assert.equal(prompts.length,1);
        for(const secret of ['INTERNAL','denied synthetic','draft synthetic','foreign synthetic']) assert.equal(prompts[0].includes(secret),false);
        assert.equal((await tx.query('SELECT id FROM ai_provenance WHERE tenant_id=$1',[tenantId])).rows.length,0);
        assert.equal((await tx.query('SELECT id FROM ai_drafts WHERE tenant_id=$1',[tenantId])).rows.length,0);
      });
      await t.test('summary denial prevents provider dispatch',async()=>{
        const count=prompts.length;
        assert.equal((await bound.summarize({patientId:deniedPatient,query:'synthetic'})).ok,false);
        assert.equal(prompts.length,count);
        assert.deepEqual(await runtime.bind({...request,permissions:new Set(['patient.read','encounter.read'])}).summarize({patientId,query:'synthetic'}),{ok:false,reason:'FEATURE_UNAVAILABLE'});
        assert.equal(prompts.length,count);
      });
      await t.test('missing production governance fails closed for read retrieval and summary',async()=>{
        const closed=createAiReadRuntime(db,{cursorKey:options.cursorKey}).bind(request);
        assert.equal((await closed.invokeTool({toolName:'get_patient',input:{patientId}})).ok,false);
        assert.equal((await closed.searchKnowledge({query:'synthetic'})).kind,'DENIED');
        assert.deepEqual(await closed.summarize({patientId,query:'synthetic'}),{ok:false,reason:'FEATURE_UNAVAILABLE'});
      });
      await t.test('audit records authenticated session, actor, scope and source IDs without payload',async()=>{
        const rows=(await tx.query('SELECT * FROM audit_events WHERE tenant_id=$1',[tenantId])).rows;
        assert.ok(rows.length>0);
        for(const row of rows){assert.equal(row.session_id,sessionId);assert.equal(row.actor_id,userId);assert.equal(row.request_id,context.requestId);}
        const success=rows.find(row=>row.action==='ai.summary.complete'); assert.ok(success);
        assert.match(JSON.stringify(success.metadata),new RegExp(docs.allowed.chunkId));
        assert.equal(JSON.stringify(rows).includes('Synthetic advisory'),false);
        assert.equal(JSON.stringify(rows).includes('synthetic evidence'),false);
      });
      await t.test('session mismatches and expiry cannot bind',()=>{
        assert.throws(()=>runtime.bind({...request,identity:{...identity,userId:randomUUID()}}),/UNAUTHENTICATED/);
        assert.throws(()=>runtime.bind({...request,identity:{...identity,accessExpiresAt:'2000-01-01'}}),/UNAUTHENTICATED/);
        assert.throws(()=>runtime.bind({...request,context:{...context,tenant:{...context.tenant!,permissionRevision:''}}}),/UNAUTHENTICATED/);
      });
      await t.test('real PostgreSQL audit rejection remains typed and blocks summary disclosure',async()=>{
        await tx.query('SAVEPOINT audit_failure');
        await tx.query("CREATE FUNCTION phase6_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ai.summary.complete' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
        await tx.query('CREATE TRIGGER phase6_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION phase6_reject_audit()');
        await assert.rejects(bound.summarize({patientId,query:'synthetic'}),MandatoryAuditError);
        await tx.query('ROLLBACK TO SAVEPOINT audit_failure');
      });
      throw rollback;
    }),error=>error===rollback);
  } finally { await database.close(); }
});
