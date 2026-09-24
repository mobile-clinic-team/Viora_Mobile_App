import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresDatabase, type TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/index.ts';
import { createDomainReadRuntime } from './domain-read-composition.ts';

const connectionString = process.env.DATABASE_URL;
test('Phase 5B PostgreSQL real read mapping, isolation, filters, keysets and immutable history', { skip: !connectionString }, async () => {
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') throw new Error('Requires VIORA_DISPOSABLE_DATABASE=1 and a migrated disposable database');
  const database = createPostgresDatabase(connectionString!);
  const rollback = new Error('owned fixture rollback');
  try {
    await assert.rejects(database.transaction(async tx => {
      // All UUID fixtures are rolled back, including append-only versions. No schema reset or trigger bypass.
      const readDatabase: TransactionalDatabase = { ...tx, transaction: async work => work(tx), close: async () => {} };
      const reads = createDomainReadRuntime(readDatabase, undefined);
      const patients = new PostgresPatientRepository(tx);
      const a = randomUUID(), b = randomUUID(), user = randomUUID(), location = randomUUID(), department = randomUUID();
      const patient = randomUUID(), doctor = randomUUID(), secondDoctor = randomUUID(), encounter = randomUUID(), record = randomUUID();
      await tx.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Read A','ACTIVE',now(),now()),($2,'Read B','ACTIVE',now(),now())", [a,b]);
      await tx.query("INSERT INTO users(id,email,status,created_at,updated_at) VALUES($1,$2,'ACTIVE',now(),now())", [user,`${user}@example.test`]);
      await tx.query("INSERT INTO locations(id,tenant_id,name,status,created_at,updated_at) VALUES($1,$2,'Read location','ACTIVE',now(),now())", [location,a]);
      await tx.query("INSERT INTO departments(id,tenant_id,name,description,status,created_at,updated_at) VALUES($1,$2,'Read department','Synthetic','ACTIVE',now(),now())", [department,a]);
      for (const [id,name] of [[doctor,'Alpha'],[secondDoctor,'Zulu']]) {
        await tx.query("INSERT INTO doctors(id,tenant_id,user_id,department_id,location_id,license_number,display_name,specialization,bio,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'Synthetic','Synthetic','ACTIVE',now(),now())", [id,a,user,department,location,`LIC-${id}`,name]);
      }
      for (const [id,name] of [[patient,'Alpha Patient'],[randomUUID(),'Zulu Patient']]) {
        await tx.query("INSERT INTO patients(id,tenant_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at) VALUES($1,$2,$3,$4,'1990-01-01','UNKNOWN','1','synthetic@example.test','Synthetic','Synthetic','ACTIVE',now(),now())", [id,a,`MRN-${id}`,name]);
      }
      const patientRows = await patients.searchDirectory({ tenantId:a,q:'patient',limit:2 });
      assert.deepEqual(patientRows.map(row=>row.fullName), ['Alpha Patient','Zulu Patient']);
      assert.equal(patientRows[0]?.dateOfBirth,'1990-01-01');
      assert.equal(patientRows[0]?.version,1n);
      assert.equal((await patients.searchDirectory({ tenantId:a,q:'patient',limit:2,after:{ fullName:patientRows[0]!.fullName,patientId:patientRows[0]!.patientId } })).length,1);
      assert.equal(await patients.findById({ tenantId:b,patientId:patient }),null);
      assert.equal((await patients.searchDirectory({ tenantId:b,q:'patient',limit:2 })).length,0);
      const doctorRows = await reads.doctors.directory({tenantId:a,limit:2});
      assert.deepEqual(doctorRows.map(row=>row.displayName),['Alpha','Zulu']);
      assert.equal((await reads.doctors.directory({tenantId:a,limit:2,after:['Alpha',doctor]}))[0]?.id,secondDoctor);
      assert.equal((await reads.doctors.directory({tenantId:a,limit:2,q:'ALP',locationId:location,status:'ACTIVE'})).length,1);
      assert.equal((await reads.doctors.directory({tenantId:a,limit:2,q:"'; --"})).length,0);
      assert.equal((await reads.doctors.directory({tenantId:b,limit:2})).length,0);
      assert.equal(await reads.doctors.findById({tenantId:b,doctorId:doctor}),null);
      const shiftIds=[randomUUID(),randomUUID()].sort();
      for(const id of shiftIds) await tx.query("INSERT INTO doctor_working_shifts(id,tenant_id,doctor_id,location_id,start_time,end_time,status,created_at,updated_at) VALUES($1,$2,$3,$4,'2026-09-20T08:00:00.123456Z','2026-09-20T10:00:00Z','ACTIVE',now(),now())",[id,a,doctor,location]);
      const window={from:'2026-09-20T00:00:00Z',to:'2026-09-21T00:00:00Z',limit:2};
      const shifts=await reads.shifts.directory({...window,tenantId:a,doctorId:doctor});
      assert.deepEqual(shifts.map(row=>row.id),shiftIds);
      assert.equal((await reads.shifts.directory({...window,tenantId:a,doctorId:doctor,after:[shifts[0]!.startTime,shiftIds[0]!]}))[0]?.id,shiftIds[1]);
      assert.equal((await reads.shifts.directory({...window,tenantId:b,doctorId:doctor})).length,0);
      const appointmentIds=[randomUUID(),randomUUID()].sort();
      // CANCELLED synthetic rows avoid making an occupancy policy assertion.
      for(const id of appointmentIds) await tx.query("INSERT INTO appointments(id,tenant_id,location_id,patient_id,doctor_id,start_time,end_time,status,reason,notes,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'2026-09-20T08:00:00.123456Z','2026-09-20T09:00:00Z','CANCELLED','Synthetic','Synthetic',$6,now(),now())",[id,a,location,patient,doctor,user]);
      const appointments=await reads.appointments.directory({...window,tenantId:a,patientId:patient,status:'CANCELLED'});
      assert.deepEqual(appointments.map(row=>row.id),appointmentIds);
      assert.equal(appointments[0]?.version,1n);
      assert.equal((await reads.appointments.directory({...window,tenantId:a,after:[appointments[0]!.startTime,appointmentIds[0]!]}))[0]?.id,appointmentIds[1]);
      assert.equal((await reads.appointments.directory({...window,tenantId:b})).length,0);
      assert.equal(await reads.appointments.findById({tenantId:b,appointmentId:appointmentIds[0]!}),null);
      const encounterIds=[encounter,randomUUID()].sort().reverse();
      for(const id of encounterIds) await tx.query("INSERT INTO encounters(id,tenant_id,patient_id,doctor_id,started_at,status,created_at,updated_at) VALUES($1,$2,$3,$4,now(),'OPEN','2026-09-20T08:00:00.123456Z',now())",[id,a,patient,doctor]);
      assert.equal((await reads.encounters.findById({tenantId:a,encounterId:encounter}))?.encounterId,encounter);
      assert.equal(await reads.encounters.findById({tenantId:b,encounterId:encounter}),null);
      const encounters=await reads.encounters.listByPatient({tenantId:a,patientId:patient,limit:2});
      assert.deepEqual(encounters.map(row=>row.encounterId),encounterIds);
      assert.equal((await reads.encounters.listByPatient({tenantId:a,patientId:patient,limit:2,after:[encounters[0]!.createdAt,encounterIds[0]!]}))[0]?.encounterId,encounterIds[1]);
      await tx.query("INSERT INTO medical_records(id,tenant_id,patient_id,encounter_id,status,current_version,created_at,updated_at) VALUES($1,$2,$3,$4,'DRAFT',2,now(),now())",[record,a,patient,encounter]);
      const versions=[randomUUID(),randomUUID()];
      for(let index=0;index<2;index++) await tx.query("INSERT INTO medical_record_versions(id,tenant_id,medical_record_id,version,diagnosis,symptoms,clinical_notes,treatment_plan,created_by,created_at) VALUES($1,$2,$3,$4,'Synthetic','Synthetic','Synthetic','Synthetic',$5,now())",[versions[index],a,record,index+1,user]);
      assert.equal((await reads.records.findById({tenantId:a,medicalRecordId:record}))?.medicalRecordId,record);
      assert.equal((await reads.records.findCurrentVersion({tenantId:a,medicalRecordId:record}))?.version,2n);
      assert.deepEqual((await reads.records.listVersions({tenantId:a,medicalRecordId:record,limit:2})).map(row=>row.version),[2n,1n]);
      assert.equal((await reads.records.listVersions({tenantId:a,medicalRecordId:record,limit:2,after:['2']}))[0]?.version,1n);
      assert.equal((await reads.records.findVersion({tenantId:a,medicalRecordId:record,versionId:versions[0]!}))?.versionId,versions[0]);
      assert.equal(await reads.records.findById({tenantId:b,medicalRecordId:record}),null);
      assert.equal(await reads.records.findCurrentVersion({tenantId:b,medicalRecordId:record}),null);
      assert.equal(await reads.records.findVersion({tenantId:b,medicalRecordId:record,versionId:versions[0]!}),null);
      assert.equal((await reads.records.listVersions({tenantId:b,medicalRecordId:record,limit:2})).length,0);
      throw rollback;
    }), error => error === rollback);
  } finally { await database.close(); }
});
