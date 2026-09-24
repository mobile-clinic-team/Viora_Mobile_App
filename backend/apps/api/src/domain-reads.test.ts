import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { ReadError, range } from '../../../libs/platform/context/src/read-page.ts';
import { readDoctorDirectory, readDoctorShifts, readDoctor } from '../../../libs/doctor/application-entrypoint/src/index.ts';
import { readAppointmentDirectory, readAppointment } from '../../../libs/appointment/application-entrypoint/src/index.ts';
import { readClinicalHistory, readClinicalRecord, readClinicalVersion, readEncounter, readPatientEncounters } from '../../../libs/clinical/application-entrypoint/src/index.ts';
import { createReadCursorCodec } from './read-cursor.ts';
import { createDomainReadDependencies, createDomainReadRuntime } from './domain-read-composition.ts';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';

const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const context = createAuthenticatedRequestContext({ requestId: 'r', correlationId: 'c', userId: id, subject: 's', tenantId: id, membershipId: id, permissionRevision: '"1"' });
const binding = { tenantId: id, permissionRevision: '"1"', purpose: 'doctors', query: '{}', sort: 'displayName,id:asc' };
const codec = createReadCursorCodec('12'.repeat(32))!;
function fixture() {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  let rows: Record<string, unknown>[] = [];
  const database: TransactionalDatabase = {
    async query<Row extends Record<string, unknown>>(sql: string, values: readonly unknown[] = []) { calls.push({ sql, values }); return { rows: rows as Row[] }; },
    async transaction(work) { return work(database); }, async close() {},
  };
  const runtime = createDomainReadRuntime(database, '12'.repeat(32));
  const deps = createDomainReadDependencies(runtime, new Set(['doctor.read','appointment.read','encounter.read','record.read']));
  return { calls, runtime, deps, setRows: (value: Record<string, unknown>[]) => { rows = value; } };
}
const denied = (code: string) => (error: unknown) => error instanceof ReadError && error.code === code;

test('read cursors authenticate tenant, filters, sort, purpose and permission revision', () => {
  const token = codec.encode(binding, ['Alpha',id]);
  assert.deepEqual(codec.decode(token,binding),['Alpha',id]);
  assert.equal(token.includes('Alpha'),false);
  for(const field of ['tenantId','query','sort','purpose'] as const) assert.throws(()=>codec.decode(token,{...binding,[field]:'other'}),denied('INVALID_PAGINATION_CURSOR'));
  assert.throws(()=>codec.decode(token,{...binding,permissionRevision:'"2"'}),denied('CONTEXT_STALE'));
  for(const value of [id,'',token+'!',token.slice(0,-8),'x'.repeat(16385)]) assert.throws(()=>codec.decode(value,binding),denied('INVALID_PAGINATION_CURSOR'));
  assert.throws(()=>createReadCursorCodec('bad'));
  assert.equal(createReadCursorCodec(undefined),null);
});

test('Doctor canonical reads use exact grants, limit+1 and opaque keyset pages', async () => {
  const f=fixture();
  f.setRows([{id,tenant_id:id,display_name:'Alpha'},{id:other,tenant_id:id,display_name:'Zulu'}]);
  const first=await readDoctorDirectory(f.deps.doctor,context,{limit:1});
  assert.equal(first.data.length,1); assert.equal(first.page.hasMore,true); assert.ok(first.page.nextCursor);
  assert.equal(f.calls[0]?.values.at(-1),2);
  assert.match(f.calls[0]!.sql,/ORDER BY display_name ASC,id ASC/);
  f.setRows([{id:other,tenant_id:id,display_name:'Zulu'}]);
  const second=await readDoctorDirectory(f.deps.doctor,context,{limit:1,cursor:first.page.nextCursor!});
  assert.equal(second.page.nextCursor,null); assert.equal(second.page.hasMore,false);
  assert.deepEqual(f.calls[1]?.values.slice(-3),['Alpha',id,2]);
  const count=f.calls.length;
  await assert.rejects(readDoctorDirectory({...f.deps.doctor,permissions:new Set(['doctor.list','DOCTOR'])},context,{}),denied('FORBIDDEN'));
  await assert.rejects(readDoctorDirectory(f.deps.doctor,context,{cursor:id}),denied('INVALID_PAGINATION_CURSOR'));
  await assert.rejects(readDoctorDirectory(f.deps.doctor,context,{limit:101}),denied('VALIDATION_ERROR'));
  await assert.rejects(readDoctorDirectory({...f.deps.doctor,cursor:null},context,{}),denied('FEATURE_UNAVAILABLE'));
  assert.equal(f.calls.length,count);
  f.setRows([{id,tenant_id:other}]);
  await assert.rejects(readDoctor(f.deps.doctor,context,id),denied('FORBIDDEN'));
});

test('shift and appointment reads enforce ranges, filters, order and resource access', async () => {
  const f=fixture(); const window={from:'2026-09-20T00:00:00Z',to:'2026-09-21T00:00:00Z'};
  f.setRows([{id,tenant_id:id,doctor_id:id,start_time:'2026-09-20T08:00:00.123456Z'}]);
  await readDoctorShifts(f.deps.doctor,context,id,window);
  assert.match(f.calls.at(-1)!.sql,/status='ACTIVE'/);
  assert.match(f.calls.at(-1)!.sql,/ORDER BY doctor_working_shifts\.start_time ASC,doctor_working_shifts\.id ASC/);
  await assert.rejects(readAppointment(f.deps.appointment,context,id),denied('FORBIDDEN'));
  await assert.rejects(readAppointmentDirectory(f.deps.appointment,context,window),denied('FORBIDDEN'));
  const authorized={...f.deps.appointment,canRead: (_context: typeof context,row: {tenantId:string}) => row.tenantId===id};
  assert.equal((await readAppointmentDirectory(authorized,context,window)).data.length,1);
  await assert.rejects(readAppointmentDirectory(authorized,context,{...window,to:'2026-12-01T00:00:00Z'}),denied('VALIDATION_ERROR'));
  assert.throws(()=>range(window.to,window.from,7),denied('VALIDATION_ERROR'));
  assert.throws(()=>range('invalid',window.to,7),denied('VALIDATION_ERROR'));
  assert.throws(()=>range('2026-02-30T00:00:00Z','2026-03-03T00:00:00Z',7),denied('VALIDATION_ERROR'));
});

test('clinical real adapters map IDs and versions; application guards history and encounter relationships', async () => {
  const f=fixture();
  f.setRows([{id,tenant_id:id,patient_id:id,created_at:'2026-09-20T00:00:00.123456Z'}]);
  assert.equal((await f.runtime.encounters.findById({tenantId:id,encounterId:id}))?.encounterId,id);
  assert.equal((await f.runtime.records.findById({tenantId:id,medicalRecordId:id}))?.medicalRecordId,id);
  await assert.rejects(readEncounter(f.deps.clinical,context,id),denied('FORBIDDEN'));
  const authorized={...f.deps.clinical,canRead: (_context: typeof context,row: {tenantId:string}) => row.tenantId===id};
  assert.equal((await readEncounter(authorized,context,id)).encounterId,id);
  await readPatientEncounters(authorized,context,id,{});
  assert.match(f.calls.at(-1)!.sql,/ORDER BY encounters\.created_at DESC,encounters\.id DESC/);
  await assert.rejects(readClinicalHistory(f.deps.clinical,context,id,{}),denied('FORBIDDEN'));
  f.setRows([{id,tenant_id:id,medical_record_id:id,current_version:'2',version:'2'}]);
  const current=await readClinicalRecord(authorized,context,id);
  assert.equal(current.record.medicalRecordId,id); assert.equal(current.version.version,2n);
  assert.equal((await readClinicalVersion(authorized,context,id,id)).versionId,id);
  await readClinicalHistory(authorized,context,id,{});
  assert.match(f.calls.at(-1)!.sql,/ORDER BY version DESC/);
  assert.equal(f.calls.at(-1)?.values.at(-1),21);
  f.setRows([]);
  await assert.rejects(readClinicalRecord(authorized,context,id),denied('NOT_FOUND'));
});
