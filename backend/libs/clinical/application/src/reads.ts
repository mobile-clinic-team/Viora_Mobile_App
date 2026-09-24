import type { RequestContext } from '../../../platform/context/src/index.ts';
import { requireRead, readPage, uuid, ReadError, type ReadCursorCodec, type PageQuery } from '../../../platform/context/src/read-page.ts';
import type { Encounter, MedicalRecord } from '../../domain/src/index.ts';
import type { EncounterReadRepository, ClinicalRecordReadRepository } from '../../domain/src/read-ports.ts';
export interface ClinicalReadDependencies {
  readonly encounters: EncounterReadRepository; readonly records: ClinicalRecordReadRepository;
  readonly permissions: ReadonlySet<string>; readonly cursor: ReadCursorCodec | null;
  /** BD-01 relationship policy must be supplied explicitly. */
  readonly canRead: (context: RequestContext, resource: Encounter | MedicalRecord) => boolean | Promise<boolean>;
}
async function check(deps: ClinicalReadDependencies, context: RequestContext, resource: Encounter | MedicalRecord): Promise<void> {
  if (resource.tenantId !== context.tenant!.tenantId || !await deps.canRead(context, resource)) throw new ReadError('FORBIDDEN');
}
function pageQuery(query: PageQuery): void {
  if (Object.keys(query).some(key => !['limit', 'cursor'].includes(key))) throw new ReadError('VALIDATION_ERROR');
}
export async function readEncounter(deps: ClinicalReadDependencies, context: RequestContext, encounterId: string) {
  const tenantId = requireRead(context, deps.permissions, 'encounter.read');
  const row = await deps.encounters.findById({ tenantId, encounterId: uuid(encounterId) });
  if (!row) throw new ReadError('NOT_FOUND');
  await check(deps, context, row);
  return row;
}
export async function readPatientEncounters(deps: ClinicalReadDependencies, context: RequestContext, patientId: string, query: PageQuery) {
  const tenantId = requireRead(context, deps.permissions, 'encounter.read');
  uuid(patientId); pageQuery(query);
  return readPage({ context, codec: deps.cursor, query, filters: { patientId }, purpose: 'patient-encounters', sort: 'createdAt,id:desc',
    load: async (limit, after) => {
      const rows = await deps.encounters.listByPatient({ tenantId, patientId, limit, after });
      // This reader has no Patient repository. An empty result cannot establish
      // canonical Patient linkage from the request's patientId alone.
      if (!rows.length) throw new ReadError('FORBIDDEN');
      for (const row of rows) {
        if (row.patientId !== patientId) throw new ReadError('FORBIDDEN');
        await check(deps, context, row);
      }
      return rows;
    },
    position: row => [row.createdAt, row.encounterId] });
}
async function record(deps: ClinicalReadDependencies, context: RequestContext, medicalRecordId: string) {
  const tenantId = requireRead(context, deps.permissions, 'record.read');
  const row = await deps.records.findById({ tenantId, medicalRecordId: uuid(medicalRecordId) });
  if (!row) throw new ReadError('NOT_FOUND');
  await check(deps, context, row);
  return row;
}
export async function readClinicalRecord(deps: ClinicalReadDependencies, context: RequestContext, medicalRecordId: string) {
  const row = await record(deps, context, medicalRecordId);
  const version = await deps.records.findCurrentVersion({ tenantId: row.tenantId, medicalRecordId });
  if (!version || version.medicalRecordId !== medicalRecordId || version.version !== row.currentVersion) throw new ReadError('NOT_FOUND');
  return { record: row, version };
}
export async function readClinicalVersion(deps: ClinicalReadDependencies, context: RequestContext, medicalRecordId: string, versionId: string) {
  const row = await record(deps, context, medicalRecordId);
  const version = await deps.records.findVersion({ tenantId: row.tenantId, medicalRecordId, versionId: uuid(versionId) });
  if (!version || version.medicalRecordId !== medicalRecordId) throw new ReadError('NOT_FOUND');
  return version;
}
export async function readClinicalHistory(deps: ClinicalReadDependencies, context: RequestContext, medicalRecordId: string, query: PageQuery) {
  const row = await record(deps, context, medicalRecordId);
  pageQuery(query);
  return readPage({ context, codec: deps.cursor, query, filters: { medicalRecordId }, purpose: 'record-versions', sort: 'version:desc',
    load: (limit, after) => deps.records.listVersions({ tenantId: row.tenantId, medicalRecordId, limit, after }), position: version => [version.version.toString()] });
}
