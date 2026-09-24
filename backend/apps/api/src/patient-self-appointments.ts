import { createHash, randomUUID } from 'node:crypto';
import type { AuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { buildAuditEvent } from '../../../libs/platform/audit/src/index.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import type { ReadCursorCodec } from '../../../libs/platform/context/src/read-page.ts';
import { ReadError, uuid } from '../../../libs/platform/context/src/read-page.ts';

const instant = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);

export interface SelfPatientLink { readonly tenantId: string; readonly patientId: string }

/** No HTTP identifier participates in self identity resolution. */
export async function resolveSelfPatients(database: Pick<TransactionalDatabase, 'query'>, context: RequestContext): Promise<readonly SelfPatientLink[]> {
  if (context.actor?.kind !== 'HUMAN' || !context.actor.userId || !context.actor.subject || context.tenant !== null)
    throw new ReadError('FORBIDDEN');
  const result = await database.query<{ tenant_id: string; patient_id: string; patient_status: string; tenant_status: string }>(
    `SELECT p.tenant_id, p.id AS patient_id, p.status AS patient_status, t.status AS tenant_status
       FROM patients p JOIN tenants t ON t.id=p.tenant_id WHERE p.user_id=$1
       ORDER BY p.tenant_id,p.id`, [context.actor.userId]);
  const tenants = new Set<string>();
  for (const row of result.rows) {
    if (tenants.has(row.tenant_id)) throw new ReadError('FORBIDDEN');
    tenants.add(row.tenant_id);
  }
  const active = result.rows.filter(row => row.patient_status === 'ACTIVE' && row.tenant_status === 'ACTIVE');
  if (!active.length) throw new ReadError('NOT_FOUND');
  return active.map(row => ({ tenantId: row.tenant_id, patientId: row.patient_id }));
}

function pageQuery(url: URL): { limit: number; cursor?: string } {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (!['limit', 'cursor'].includes(key) || Object.hasOwn(query, key)) throw new ReadError('VALIDATION_ERROR');
    query[key] = value;
  }
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (query.limit !== undefined && !/^[1-9][0-9]*$/.test(query.limit) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      query.cursor !== undefined && (!query.cursor || query.cursor.length > 16384)) throw new ReadError('VALIDATION_ERROR');
  return { limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor }) };
}

export function validateSelfBookingBody(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ReadError('VALIDATION_ERROR');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !['doctorId', 'locationId', 'startsAt', 'reason'].includes(key))) throw new ReadError('VALIDATION_ERROR');
  uuid(value.doctorId as string); uuid(value.locationId as string);
  if (!instant(value.startsAt) || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 1000)
    throw new ReadError('VALIDATION_ERROR');
}

export function createPatientSelfAppointments(database: TransactionalDatabase, cursor: ReadCursorCodec | null,
  audit: Pick<AuditEventRepository, 'append'>) {
  return {
    resolve: (context: RequestContext) => resolveSelfPatients(database, context),
    async list(context: RequestContext, url: URL, sessionId?: string) {
      const query = pageQuery(url);
      const links = await resolveSelfPatients(database, context);
      if (!cursor) throw new ReadError('FEATURE_UNAVAILABLE');
      const revision = createHash('sha256').update(JSON.stringify(links)).digest('hex');
      const binding = { tenantId: context.actor!.userId, permissionRevision: revision,
        purpose: 'patient-self-appointments', sort: 'startsAt,id:asc', query: '{}' };
      const after = query.cursor === undefined ? undefined : cursor.decode(query.cursor, binding);
      if (after && (after.length !== 2 || !instant(after[0]) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after[1]!)))
        throw new ReadError('INVALID_PAGINATION_CURSOR');
      const result = await database.query<{
        id: string; tenant_id: string; clinic_name: string; doctor_name: string; location_name: string;
        starts_at: string; ends_at: string; status: string; reason: string;
      }>(`SELECT a.id, a.tenant_id, t.name AS clinic_name, d.display_name AS doctor_name, l.name AS location_name,
          to_char(a.start_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS starts_at,
          to_char(a.end_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ends_at,
          a.status::text AS status, a.reason
        FROM appointments a
        JOIN patients p ON p.tenant_id=a.tenant_id AND p.id=a.patient_id
        JOIN tenants t ON t.id=a.tenant_id
        JOIN doctors d ON d.tenant_id=a.tenant_id AND d.id=a.doctor_id
        JOIN locations l ON l.tenant_id=a.tenant_id AND l.id=a.location_id
        WHERE p.user_id=$1 AND p.status='ACTIVE' AND t.status='ACTIVE'
          AND ($2::timestamptz IS NULL OR (a.start_time,a.id)>($2::timestamptz,$3::uuid))
        ORDER BY a.start_time ASC,a.id ASC LIMIT $4`,
      [context.actor!.userId, after?.[0] ?? null, after?.[1] ?? null, query.limit + 1]);
      const rows = result.rows.slice(0, query.limit);
      for (const row of rows) {
        const event = buildAuditEvent({ id: randomUUID(), tenantId: row.tenant_id, actorId: context.actor!.userId,
          ...(sessionId === undefined ? {} : { sessionId }), action: 'appointment.read.self', resourceType: 'APPOINTMENT',
          resourceId: row.id, result: 'SUCCESS', requestId: context.requestId, correlationId: context.correlationId,
          metadata: {} });
        if ((await audit.append(event)).kind !== 'APPENDED') throw new Error('appointment read audit unavailable');
      }
      const data = rows.map(row => ({ id: row.id, clinicName: row.clinic_name, doctorName: row.doctor_name,
        locationName: row.location_name, startsAt: row.starts_at, endsAt: row.ends_at,
        status: row.status, reason: row.reason }));
      const hasMore = result.rows.length > query.limit;
      return { data, page: { hasMore, nextCursor: hasMore && rows.length ?
        cursor.encode(binding, [rows[rows.length - 1]!.starts_at, rows[rows.length - 1]!.id]) : null } };
    },
  };
}
