import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createPostgresDatabase, createPostgresMigrationDatabase, loadMigrationFiles, runMigrations } from '../../../libs/platform/database/src/index.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import { createReadCursorCodec } from './read-cursor.ts';
import { createPatientSelfAppointments } from './patient-self-appointments.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';

test('Run 2 PostgreSQL self links, cross-clinic own list, isolation, pagination and uniqueness',
  { skip: !process.env.DATABASE_URL }, async () => {
  const url = process.env.DATABASE_URL!;
  if (new URL(url).pathname !== '/viora_mobile_test' || process.env.VIORA_DISPOSABLE_DATABASE !== '1')
    throw new Error('Disposable viora_mobile_test required');
  const migration = createPostgresMigrationDatabase(url);
  try {
    await migration.query('DROP SCHEMA public CASCADE');
    await migration.query('CREATE SCHEMA public');
    const applied = await runMigrations(migration, await loadMigrationFiles(fileURLToPath(new URL('../../../database/migrations', import.meta.url))));
    assert.equal(applied.at(-1)?.version, '026');
  } finally { await migration.close(); }
  const db = createPostgresDatabase(url);
  try {
    const user = randomUUID(), other = randomUUID();
    const a = randomUUID(), b = randomUUID();
    const locationA = randomUUID(), locationB = randomUUID(), departmentA = randomUUID(), departmentB = randomUUID();
    const doctorA = randomUUID(), doctorB = randomUUID(), patientA = randomUUID(), patientB = randomUUID(), foreign = randomUUID();
    const appointmentA = randomUUID(), appointmentB = randomUUID(), foreignAppointment = randomUUID();
    await db.query("INSERT INTO users(id,email,status,created_at,updated_at) VALUES($1,$2,'ACTIVE',now(),now()),($3,$4,'ACTIVE',now(),now())",
      [user, `${user}@example.test`, other, `${other}@example.test`]);
    await db.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Clinic A','ACTIVE',now(),now()),($2,'Clinic B','ACTIVE',now(),now())", [a,b]);
    for (const [tenant, location, department, doctor, name] of [[a,locationA,departmentA,doctorA,'Doctor A'],[b,locationB,departmentB,doctorB,'Doctor B']]) {
      await db.query("INSERT INTO locations(id,tenant_id,name,status,created_at,updated_at) VALUES($1,$2,'Main','ACTIVE',now(),now())",[location,tenant]);
      await db.query("INSERT INTO departments(id,tenant_id,name,description,status,created_at,updated_at) VALUES($1,$2,'General','General','ACTIVE',now(),now())",[department,tenant]);
      await db.query("INSERT INTO doctors(id,tenant_id,user_id,department_id,location_id,license_number,display_name,specialization,bio,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'General','', 'ACTIVE',now(),now())",
        [doctor,tenant,other,department,location,`LIC-${doctor}`,name]);
    }
    for (const [id, tenant, linked, mrn] of [[patientA,a,user,'A'],[patientB,b,user,'B'],[foreign,a,other,'C']]) {
      await db.query("INSERT INTO patients(id,tenant_id,user_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at) VALUES($1,$2,$3,$4,'Patient','1990-01-01','UNKNOWN','1','patient@example.test','Address','Contact','ACTIVE',now(),now())",
        [id,tenant,linked,`MRN-${mrn}`]);
    }
    await assert.rejects(db.query("INSERT INTO patients(id,tenant_id,user_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at) VALUES($1,$2,$3,'MRN-D','Patient','1990-01-01','UNKNOWN','1','patient@example.test','Address','Contact','ACTIVE',now(),now())",
      [randomUUID(),a,user]), (error: unknown) => (error as { code?: string }).code === '23505');
    for (const [id, tenant, location, patient, doctor, starts] of [
      [appointmentA,a,locationA,patientA,doctorA,'2026-10-01T08:00:00Z'],
      [appointmentB,b,locationB,patientB,doctorB,'2026-10-02T08:00:00Z'],
      [foreignAppointment,a,locationA,foreign,doctorA,'2026-10-03T08:00:00Z'],
    ]) await db.query("INSERT INTO appointments(id,tenant_id,location_id,patient_id,doctor_id,start_time,end_time,status,reason,notes,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6::timestamptz + interval '30 minutes','CANCELLED','Visit','Internal note',$7,now(),now())",
      [id,tenant,location,patient,doctor,starts,other]);
    const context: RequestContext = { requestId: randomUUID(), correlationId: randomUUID(),
      actor: { userId:user, subject:user, kind:'HUMAN' }, tenant:null };
    const api = createPatientSelfAppointments(db, createReadCursorCodec('a'.repeat(64)), new PostgresAuditEventRepository(db));
    assert.equal((await api.resolve(context)).length, 2);
    const first = await api.list(context, new URL('https://example.test/v1/me/appointments?limit=1'));
    assert.deepEqual(first.data.map(row => row.id), [appointmentA]);
    assert.equal(first.data[0]?.clinicName, 'Clinic A');
    assert.equal(JSON.stringify(first).includes('Internal note'), false);
    assert.ok(first.page.nextCursor);
    const second = await api.list(context, new URL(`https://example.test/v1/me/appointments?limit=1&cursor=${encodeURIComponent(first.page.nextCursor!)}`));
    assert.deepEqual(second.data.map(row => row.id), [appointmentB]);
    assert.equal(second.page.hasMore, false);
    assert.equal(JSON.stringify(first).includes(foreignAppointment), false);
    const otherContext: RequestContext = { ...context, actor: { userId:other, subject:other, kind:'HUMAN' } };
    assert.deepEqual((await api.list(otherContext, new URL('https://example.test/v1/me/appointments'))).data.map(row => row.id), [foreignAppointment]);
  } finally { await db.close(); }
});
