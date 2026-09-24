import type { RequestContext } from '../../../platform/context/src/index.ts';
import { requireRead, readPage, range, uuid, ReadError, type ReadCursorCodec } from '../../../platform/context/src/read-page.ts';
import type { Appointment } from '../../domain/src/index.ts';
import type { AppointmentReadQuery, AppointmentReadRepository } from '../../domain/src/read-ports.ts';
export interface AppointmentReadDependencies {
  readonly appointments: AppointmentReadRepository; readonly permissions: ReadonlySet<string>; readonly cursor: ReadCursorCodec | null;
  /** BD-01: no default relationship policy. */
  readonly canRead: (context: RequestContext, appointment: Appointment) => boolean;
}
function check(deps: AppointmentReadDependencies, context: RequestContext, row: Appointment): void {
  if (row.tenantId !== context.tenant!.tenantId || !deps.canRead(context, row)) throw new ReadError('FORBIDDEN');
}
export async function readAppointment(deps: AppointmentReadDependencies, context: RequestContext, appointmentId: string) {
  const tenantId = requireRead(context, deps.permissions, 'appointment.read');
  const row = await deps.appointments.findById({ tenantId, appointmentId: uuid(appointmentId) });
  if (!row) throw new ReadError('NOT_FOUND');
  check(deps, context, row);
  return row;
}
export async function readAppointmentDirectory(deps: AppointmentReadDependencies, context: RequestContext, query: AppointmentReadQuery) {
  const tenantId = requireRead(context, deps.permissions, 'appointment.read');
  if (Object.keys(query).some(key => !['from', 'to', 'doctorId', 'patientId', 'locationId', 'status', 'limit', 'cursor'].includes(key))) throw new ReadError('VALIDATION_ERROR');
  range(query.from, query.to, 31);
  if (query.status !== undefined && !['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(query.status)) throw new ReadError('VALIDATION_ERROR');
  const filters = { from: query.from, to: query.to, doctorId: query.doctorId === undefined ? undefined : uuid(query.doctorId),
    patientId: query.patientId === undefined ? undefined : uuid(query.patientId), locationId: query.locationId === undefined ? undefined : uuid(query.locationId), status: query.status };
  return readPage({ context, codec: deps.cursor, query, filters, purpose: 'appointments', sort: 'startsAt,id:asc',
    load: async (limit, after) => { const rows = await deps.appointments.directory({ ...filters, tenantId, limit, after }); rows.forEach(row => check(deps, context, row)); return rows; },
    position: row => [row.startTime, row.id] });
}
