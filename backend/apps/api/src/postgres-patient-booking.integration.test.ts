import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations } from '../../../libs/platform/database/src/index.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { createPatientSelfBooking } from './patient-self-booking.ts';
import { SessionService } from '../../../libs/identity/application/src/session-service.ts';
import { PostgresSessionRepository, PostgresIdentityContextStore } from '../../../libs/identity/data-access/src/index.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/index.ts';
import { PostgresIdempotencyStore } from '../../../libs/platform/idempotency/src/index.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { createVioraHttpServer } from './http-server.ts';
import { createPatientSelfAppointments } from './patient-self-appointments.ts';
import { createReadCursorCodec } from './read-cursor.ts';

test('Run 2 PostgreSQL Patient booking acceptance', { skip: !process.env.DATABASE_URL }, async t => {
  const url = process.env.DATABASE_URL!;
  if (new URL(url).pathname !== '/viora_mobile_test' || process.env.VIORA_DISPOSABLE_DATABASE !== '1')
    throw new Error('Disposable viora_mobile_test required');
  const migration = createPostgresMigrationDatabase(url);
  try {
    await migration.query('DROP SCHEMA public CASCADE');
    await migration.query('CREATE SCHEMA public');
    assert.equal((await runMigrations(migration, await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations', import.meta.url))))).at(-1)?.version, '026');
  } finally { await migration.close(); }
  const db = createPostgresDatabase(url);
  try {
    const user = randomUUID(), other = randomUUID(), tenant = randomUUID(), foreignTenant = randomUUID();
    const location = randomUUID(), otherLocation = randomUUID(), foreignLocation = randomUUID(), department = randomUUID();
    const doctor = randomUUID(), doctor2 = randomUUID(), patient = randomUUID(), session = randomUUID(), otherSession = randomUUID();
    for (const id of [user, other]) {
      await db.query("INSERT INTO users(id,email,status,created_at,updated_at) VALUES($1::uuid,$2,'ACTIVE',now(),now())", [id, `${id}@example.test`]);
      await db.query("INSERT INTO identity_subjects(issuer,subject,user_id,created_at) VALUES('https://example.test',$1::text,$1::uuid,now())", [id]);
      await db.query(`INSERT INTO sessions(id,user_id,status,created_at,last_seen_at,expires_at,access_expires_at,identity_issuer,identity_subject)
        VALUES($1::uuid,$2::uuid,'ACTIVE',now(),now(),now()+interval '1 day',now()+interval '1 hour','https://example.test',$2::text)`, [id === user ? session : otherSession,id]);
    }
    for (const id of [tenant,foreignTenant]) await db.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Clinic','ACTIVE',now(),now())",[id]);
    for (const [id,clinic] of [[location,tenant],[otherLocation,tenant],[foreignLocation,foreignTenant]])
      await db.query("INSERT INTO locations(id,tenant_id,name,status,created_at,updated_at) VALUES($1::uuid,$2::uuid,$1::text,'ACTIVE',now(),now())",[id,clinic]);
    await db.query("INSERT INTO departments(id,tenant_id,name,description,status,created_at,updated_at) VALUES($1::uuid,$2::uuid,'General','','ACTIVE',now(),now())",[department,tenant]);
    for (const id of [doctor,doctor2]) {
      await db.query(`INSERT INTO doctors(id,tenant_id,user_id,department_id,location_id,license_number,display_name,specialization,bio,status,created_at,updated_at)
        VALUES($1::uuid,$2::uuid,$3,$4,$5,$1::text,'Doctor','General','','ACTIVE',now(),now())`,[id,tenant,other,department,location]);
      await db.query(`INSERT INTO doctor_working_shifts(id,tenant_id,doctor_id,location_id,start_time,end_time,status,created_at,updated_at)
        VALUES($1::uuid,$2::uuid,$3,$4,date_trunc('day',now())+interval '1 day',date_trunc('day',now())+interval '3 days','ACTIVE',now(),now())`,[randomUUID(),tenant,id,location]);
    }
    for (const [id,owner] of [[patient,user],[randomUUID(),other]]) await db.query(`INSERT INTO patients
      (id,tenant_id,user_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at)
      VALUES($1::uuid,$2::uuid,$3,$1::text,'Patient','1990-01-01','UNKNOWN','1','patient@example.test','Address','Contact','ACTIVE',now(),now())`,[id,tenant,owner]);
    const context: RequestContext = { requestId:randomUUID(),correlationId:randomUUID(),actor:{ userId:user,subject:user,kind:'HUMAN' },tenant:null };
    const api = createPatientSelfBooking(db);
    const tomorrow = new Date(); tomorrow.setUTCHours(0,0,0,0); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    const at = (minutes: number) => new Date(tomorrow.getTime()+minutes*60000).toISOString();
    const intent = (minutes: number) => ({ doctorId:doctor,locationId:location,startsAt:at(minutes),reason:'Visit' });
    const book = (body: unknown, key = randomUUID(), time = new Date().toISOString()) => api.create(context,session,body,key,time);
    const code = (expected:string) => (error:unknown) => (error as {code?:string}).code === expected;
    let offset = 0;
    await t.test('migration 026 installs the exact occupying status exclusion', async () => {
      const constraint = (await db.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='appointments_doctor_schedule_exclusion'" )).rows[0]!.definition;
      assert.match(constraint, /EXCLUDE USING gist/);
      for (const status of ['PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS']) assert.ok(constraint.includes(status));
      for (const status of ['CANCELLED','COMPLETED','NO_SHOW']) assert.ok(!constraint.includes(status));
    });
    await t.test('valid booking derives Patient, exact 30 minutes, PENDING and mandatory audit', async () => {
      const result = await book(intent(offset)); offset += 60;
      const row = (await db.query('SELECT patient_id,status,extract(epoch FROM (end_time-start_time)) AS seconds FROM appointments WHERE id=$1',[result.primary.id])).rows[0]!;
      assert.equal(row.patient_id,patient); assert.equal(row.status,'PENDING'); assert.equal(Number(row.seconds),1800);
      const audit = await db.query("SELECT metadata,actor_id,session_id,tenant_id,operation_id FROM audit_events WHERE resource_id=$1 AND action='appointment.created'",[result.primary.id]);
      assert.equal(audit.rows.length,1); assert.deepEqual(audit.rows[0]!.metadata,{});
      assert.equal(audit.rows[0]!.actor_id,user); assert.equal(audit.rows[0]!.session_id,session);
      assert.equal(audit.rows[0]!.tenant_id,tenant); assert.ok(audit.rows[0]!.operation_id);
      assert.deepEqual(await createPatientSelfBooking(db).recover(context,session,result.operationId),result);
    });
    for (const field of ['patientId','userId','tenantId','membershipId','persona','role','status','allowedActions','auditActor','endsAt','durationMinutes'])
      await t.test(`client authority/duration ${field} rejected`, async () => { await assert.rejects(book({...intent(offset),[field]:field === 'durationMinutes' ? 60 : randomUUID()}),code('VALIDATION_ERROR')); });
    for (const [name,body,expected] of [
      ['invalid clinic', {...intent(offset),locationId:randomUUID()},'FORBIDDEN'],
      ['Patient clinic scope', {...intent(offset),locationId:foreignLocation},'FORBIDDEN'],
      ['invalid Doctor', {...intent(offset),doctorId:randomUUID()},'VALIDATION_ERROR'],
      ['Doctor/location mismatch', {...intent(offset),locationId:otherLocation},'VALIDATION_ERROR'],
      ['no active shift', intent(3*1440),'VALIDATION_ERROR'],
      ['partial outside shift', intent(2*1440-15),'VALIDATION_ERROR'],
    ] as const) await t.test(name, async () => { await assert.rejects(book(body),code(expected)); });
    await t.test('inactive Doctor, location and shift are rejected', async () => {
      for (const [table,column,id,expected] of [
        ['doctors','id',doctor,'VALIDATION_ERROR'], ['locations','id',location,'FORBIDDEN'],
        ['doctor_working_shifts','doctor_id',doctor,'VALIDATION_ERROR'],
      ]) {
        await db.query(`UPDATE ${table} SET status='${table === 'doctor_working_shifts' ? 'CANCELLED' : 'INACTIVE'}' WHERE ${column}=$1`,[id]);
        try { await assert.rejects(book(intent(offset)),code(expected!)); }
        finally { await db.query(`UPDATE ${table} SET status='ACTIVE' WHERE ${column}=$1`,[id]); }
      }
    });
    await t.test('Patient without a linked profile is rejected', async () => {
      await db.query('UPDATE patients SET user_id=NULL WHERE id=$1',[patient]);
      try { await assert.rejects(book(intent(offset)),code('NOT_FOUND')); }
      finally { await db.query('UPDATE patients SET user_id=$2 WHERE id=$1',[patient,user]); }
    });
    await t.test('options contain eligible linked clinic slots and omit occupied slots', async () => {
      const result = await api.options(context);
      assert.equal(result.durationMinutes,30); assert.ok(result.data.length > 0);
      assert.ok(result.data.every(slot => slot.locationId === location));
      assert.ok(!result.data.some(slot => slot.doctorId === doctor && Date.parse(slot.startsAt) === Date.parse(at(0))));
    });
    for (const status of ['PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS','CANCELLED','COMPLETED','NO_SHOW']) {
      await t.test(`occupancy ${status}`, async () => {
        const body = intent(offset); offset += 60;
        const original = await book(body);
        await db.query('UPDATE appointments SET status=$2 WHERE id=$1',[original.primary.id,status]);
        if (['CANCELLED','COMPLETED','NO_SHOW'].includes(status)) assert.equal((await book(body)).state,'SUCCEEDED');
        else await assert.rejects(book(body),code('CONFLICT'));
      });
    }
    for (const overlap of [0,15]) await t.test(`concurrent race offset ${overlap} minutes`,async () => {
      const start = offset; offset += 90;
      const results = await Promise.allSettled([book(intent(start)),book(intent(start+overlap))]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
      assert.equal(results.filter(r => r.status === 'rejected' && code('CONFLICT')(r.reason)).length,1);
    });
    await t.test('different Doctors same time allowed',async () => {
      const body = intent(offset); offset += 60;
      assert.equal((await Promise.all([book(body),book({...body,doctorId:doctor2})])).length,2);
    });
    await t.test('same key replay, different intent conflict and concurrent no duplicate',async () => {
      const body = intent(offset); offset += 60;
      const key = randomUUID(), timestamp = new Date().toISOString();
      const results = await Promise.allSettled([book(body,key,timestamp),book(body,key,timestamp)]);
      const winner = results.find(r => r.status === 'fulfilled'); assert.ok(winner?.status === 'fulfilled');
      for (const result of results) if (result.status === 'rejected') assert.ok(code('OPERATION_IN_PROGRESS')(result.reason));
      assert.deepEqual(await book(body,key,timestamp),winner.value);
      assert.deepEqual(await createPatientSelfBooking(db).recover(context,session,key),winner.value);
      await assert.rejects(book({...body,reason:'Changed'},key,timestamp),code('IDEMPOTENCY_CONFLICT'));
      assert.equal((await db.query('SELECT id FROM appointments WHERE doctor_id=$1 AND start_time=$2',[doctor,body.startsAt])).rows.length,1);
      const otherContext = {...context,actor:{userId:other,subject:other,kind:'HUMAN' as const}};
      await assert.rejects(api.recover(otherContext,otherSession,key),code('NOT_FOUND'));
    });
    await t.test('same key at another linked clinic is an intent conflict',async () => {
      const foreignPatient = randomUUID();
      await db.query(`INSERT INTO patients
        (id,tenant_id,user_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at)
        VALUES($1::uuid,$2,$3,$1::text,'Patient','1990-01-01','UNKNOWN','1','patient@example.test','Address','Contact','ACTIVE',now(),now())`,[foreignPatient,foreignTenant,user]);
      const body = intent(offset); offset += 60;
      const key = randomUUID(), timestamp = new Date().toISOString();
      const result = await book(body,key,timestamp);
      await assert.rejects(book({...body,locationId:foreignLocation},key,timestamp),code('IDEMPOTENCY_CONFLICT'));
      assert.deepEqual(await api.recover(context,session,key),result);
      assert.equal((await db.query('SELECT id FROM operations WHERE actor_id=$1 AND idempotency_key=$2',[user,key])).rows.length,1);
    });
    await t.test('eligibility is rechecked after operation admission before commit', async () => {
      let transactions = 0;
      const rechecking = createPatientSelfBooking({ ...db, async transaction(work) {
        transactions++;
        if (transactions === 3) await db.query("UPDATE doctor_working_shifts SET status='CANCELLED' WHERE doctor_id=$1",[doctor]);
        return db.transaction(work);
      } });
      const body = intent(offset); offset += 60;
      try { await assert.rejects(rechecking.create(context,session,body,randomUUID(),new Date().toISOString()),code('VALIDATION_ERROR')); }
      finally { await db.query("UPDATE doctor_working_shifts SET status='ACTIVE' WHERE doctor_id=$1",[doctor]); }
      assert.equal((await db.query('SELECT id FROM appointments WHERE doctor_id=$1 AND start_time=$2',[doctor,body.startsAt])).rows.length,0);
    });
    await t.test('audit failure rolls back appointment and leaves operation for recovery',async () => {
      const key = randomUUID(), body = intent(offset); offset += 60;
      await db.query(`CREATE FUNCTION reject_booking_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action='appointment.created' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$`);
      await db.query('CREATE TRIGGER reject_booking_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_booking_audit()');
      try { await assert.rejects(book(body,key)); }
      finally { await db.query('DROP TRIGGER reject_booking_audit ON audit_events'); await db.query('DROP FUNCTION reject_booking_audit()'); }
      assert.equal((await db.query('SELECT id FROM appointments WHERE doctor_id=$1 AND start_time=$2',[doctor,body.startsAt])).rows.length,0);
      await assert.rejects(api.recover(context,session,key),code('OPERATION_IN_PROGRESS'));
    });
    await t.test('real bearer HTTP booking, list, replay, recovery and revoke use PostgreSQL',async () => {
      const sessions = new SessionService({sessions:new PostgresSessionRepository(db)});
      const tokens = await sessions.createSession({userId:user,subject:{issuer:'https://example.test',subject:user}});
      const server = createVioraHttpServer({sessions,identities:new PostgresIdentityContextStore(db),
        patients:new PostgresPatientRepository(db),idempotency:new PostgresIdempotencyStore(db),patientDirectoryCursor:null,
        selfBooking:api,selfAppointments:createPatientSelfAppointments(db,createReadCursorCodec('b'.repeat(64)),new PostgresAuditEventRepository(db)),
        membershipGrants:{async listPermissions() {return [];}},
        authTransactions:{async createTransaction() {throw new Error('Not used');},async completeSession() {throw new Error('Not used');}},
      });
      await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
      const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
      const key = randomUUID(), body = intent(offset); offset += 60;
      const headers = {Authorization:`Bearer ${tokens.accessToken}`,'Content-Type':'application/json',
        'Idempotency-Key':key,'X-Operation-Created-At':new Date().toISOString()};
      try {
        const post = () => fetch(`${origin}/v1/me/appointments`,{method:'POST',headers,body:JSON.stringify(body)});
        const first = await post(); assert.equal(first.status,201); assert.equal(first.headers.get('etag'),'"1"');
        const result = await first.json() as {data:{primary:{id:string}}};
        const replay = await post(); assert.equal(replay.status,201); assert.deepEqual(await replay.json(),result);
        const recovered = await fetch(`${origin}/v1/me/appointment-operations/${key}`,{headers});
        assert.equal(recovered.status,200); assert.deepEqual(await recovered.json(),result);
        const listed = await fetch(`${origin}/v1/me/appointments?limit=100`,{headers}); assert.equal(listed.status,200);
        const page = await listed.json() as {data:{id:string;status:string;startsAt:string;endsAt:string}[]};
        const appointment = page.data.find(row => row.id === result.data.primary.id)!;
        assert.ok(appointment); assert.equal(appointment.status,'PENDING');
        assert.equal(Date.parse(appointment.endsAt)-Date.parse(appointment.startsAt),1800000);
        assert.equal((await fetch(`${origin}/v1/me/appointments`,{method:'POST',headers,
          body:JSON.stringify({...body,patientId:patient})})).status,400);
        await sessions.revokeAccessSession({accessToken:tokens.accessToken});
        assert.equal((await post()).status,401);
      } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    });
    await t.test('invalid and revoked session rejected',async () => {
      await assert.rejects(api.create(context,randomUUID(),intent(offset),randomUUID(),new Date().toISOString()),code('UNAUTHENTICATED'));
      await db.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE id=$1",[session]);
      await assert.rejects(book(intent(offset)),code('UNAUTHENTICATED'));
    });
  } finally { await db.close(); }
});

