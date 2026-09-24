import type { RequestContext } from '../../../platform/context/src/index.ts';
import { requireRead, readPage, range, uuid, ReadError, type ReadCursorCodec, type PageQuery } from '../../../platform/context/src/read-page.ts';
import type { DoctorDirectoryQuery, DoctorReadRepository, ShiftReadRepository } from '../../domain/src/read-ports.ts';

export interface DoctorReadDependencies { readonly doctors: DoctorReadRepository; readonly shifts: ShiftReadRepository; readonly permissions: ReadonlySet<string>; readonly cursor: ReadCursorCodec | null }
export async function readDoctor(deps: DoctorReadDependencies, context: RequestContext, doctorId: string) {
  const tenantId = requireRead(context, deps.permissions, 'doctor.read');
  const doctor = await deps.doctors.findById({ tenantId, doctorId: uuid(doctorId) });
  if (!doctor) throw new ReadError('NOT_FOUND');
  if (doctor.tenantId !== tenantId) throw new ReadError('FORBIDDEN');
  return doctor;
}
export async function readDoctorDirectory(deps: DoctorReadDependencies, context: RequestContext, query: DoctorDirectoryQuery) {
  const tenantId = requireRead(context, deps.permissions, 'doctor.read');
  if (Object.keys(query).some(key => !['q', 'locationId', 'status', 'limit', 'cursor'].includes(key))) throw new ReadError('VALIDATION_ERROR');
  if (query.q !== undefined && (typeof query.q !== 'string' || Array.from(query.q.trim()).length > 100)) throw new ReadError('VALIDATION_ERROR');
  if (query.status !== undefined && !['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(query.status)) throw new ReadError('VALIDATION_ERROR');
  const filters = { q: query.q?.trim(), locationId: query.locationId === undefined ? undefined : uuid(query.locationId), status: query.status };
  return readPage({ context, codec: deps.cursor, query, filters, purpose: 'doctors', sort: 'displayName,id:asc',
    load: async (limit, after) => {
      const rows = await deps.doctors.directory({ ...filters, tenantId, limit, after });
      if (rows.some(row => row.tenantId !== tenantId)) throw new ReadError('FORBIDDEN');
      return rows;
    }, position: row => [row.displayName, row.id] });
}
export async function readDoctorShifts(deps: DoctorReadDependencies, context: RequestContext, doctorId: string, query: PageQuery & { readonly from: string; readonly to: string; readonly locationId?: string }) {
  const doctor = await readDoctor(deps, context, doctorId);
  if (Object.keys(query).some(key => !['from', 'to', 'locationId', 'limit', 'cursor'].includes(key))) throw new ReadError('VALIDATION_ERROR');
  range(query.from, query.to, 7);
  const filters = { doctorId, from: query.from, to: query.to, locationId: query.locationId === undefined ? undefined : uuid(query.locationId) };
  return readPage({ context, codec: deps.cursor, query, filters, purpose: 'doctor-shifts', sort: 'startsAt,id:asc',
    load: async (limit, after) => {
      const rows = await deps.shifts.directory({ ...filters, tenantId: doctor.tenantId, limit, after });
      if (rows.some(row => row.tenantId !== doctor.tenantId || row.doctorId !== doctorId)) throw new ReadError('FORBIDDEN');
      return rows;
    }, position: row => [row.startTime, row.id] });
}
