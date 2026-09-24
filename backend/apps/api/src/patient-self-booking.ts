import { randomUUID } from 'node:crypto';
import { PostgresAppointmentRepository } from '../../../libs/appointment/data-access/src/postgres-appointment-repository.ts';
import { assertAppointmentTimeRange } from '../../../libs/appointment/domain/src/index.ts';
import { AppointmentSchedulingConflictError } from '../../../libs/appointment/domain/src/repository-ports.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import { buildAuditEvent } from '../../../libs/platform/audit/src/index.ts';
import type { RequestContext } from '../../../libs/platform/context/src/index.ts';
import type { DatabaseSession, TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { PostgresOperationStore, OperationStoreError, type OperationRecord } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';
import { parseOperationIdentity, patientCommandFingerprint, PatientCommandError } from './patient-create-operation-contract.ts';
import { resolveSelfPatients, validateSelfBookingBody } from './patient-self-appointments.ts';

type Intent = { doctorId: string; locationId: string; startsAt: string; reason: string };
const reject = (code: string, status: number): never => { throw new PatientCommandError(code, status); };
function receipt(record: OperationRecord) {
  if (record.status !== 'SUCCEEDED' || record.resultResourceType !== 'APPOINTMENT' || !record.resultResourceId || !record.resultResourceVersion)
    return reject('INTERNAL_ERROR', 500);
  return { operationId: record.idempotencyKey, state: 'SUCCEEDED' as const,
    primary: { type: 'APPOINTMENT' as const, id: record.resultResourceId, parentId: null, versionToken: `"${record.resultResourceVersion}"` },
    related: [], handoff: null, committedAt: record.updatedAt.toISOString(),
    expiresAt: new Date(record.updatedAt.getTime() + 86400000).toISOString() };
}

async function activeSession(db: DatabaseSession, context: RequestContext, sessionId: string) {
  const rows = await db.query(`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=$1 AND s.user_id=$2 AND s.identity_subject=$3 AND s.status='ACTIVE' AND s.revoked_at IS NULL
      AND s.expires_at>clock_timestamp() AND s.access_expires_at>clock_timestamp() AND u.status='ACTIVE'
    FOR SHARE OF s,u`, [sessionId, context.actor?.userId, context.actor?.subject]);
  if (!rows.rows.length) reject('UNAUTHENTICATED', 401);
}

async function target(db: DatabaseSession, context: RequestContext, locationId: string) {
  await resolveSelfPatients(db, context);
  const result = await db.query<{ tenant_id: string; patient_id: string }>(`SELECT l.tenant_id,p.id AS patient_id
    FROM locations l JOIN tenants t ON t.id=l.tenant_id JOIN patients p ON p.tenant_id=t.id
    WHERE l.id=$1 AND p.user_id=$2 AND l.status='ACTIVE' AND t.status='ACTIVE' AND p.status='ACTIVE'
    FOR SHARE OF l,t,p`, [locationId, context.actor!.userId]);
  if (result.rows.length !== 1) return reject('FORBIDDEN', 403);
  return result.rows[0]!;
}

/** Uses the shared durable operation store, canonical appointment repository and mandatory audit transaction. */
export function createPatientSelfBooking(db: TransactionalDatabase) {
  const operations = new PostgresOperationStore(db);
  return {
    async create(context: RequestContext, sessionId: string, body: unknown, key: unknown, timestamp: unknown) {
      validateSelfBookingBody(body);
      const intent = body as Intent;
      const identity = parseOperationIdentity(key, timestamp);
      const scope = await db.transaction(async tx => {
        await activeSession(tx, context, sessionId);
        return target(tx, context, intent.locationId);
      });
      const operationIntent = { ...identity, tenantId: scope.tenant_id, actorId: context.actor!.userId,
        requestFingerprint: patientCommandFingerprint({ ...intent, resolvedPatientId: scope.patient_id }, identity.operationCreatedAt,
          'POST', '/v1/me/appointments', null) };
      let admitted;
      try {
        admitted = await db.transaction(async tx => {
          // SELF receipts carry no tenant selector. Serialize admission for this actor so
          // reusing a key at another clinic cannot create a second, ambiguous result.
          await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [context.actor!.userId]);
          const existing = await tx.query<{ tenant_id: string }>(
            'SELECT tenant_id FROM operations WHERE actor_id=$1 AND idempotency_key=$2',
            [context.actor!.userId, identity.idempotencyKey]);
          if (existing.rows.some(row => row.tenant_id !== scope.tenant_id)) return reject('IDEMPOTENCY_CONFLICT', 409);
          return new PostgresOperationStore(tx).admit(operationIntent);
        });
      }
      catch (error) { if (error instanceof OperationStoreError) return reject(error.code, 409); throw error; }
      if (admitted.kind === 'CONFLICT') return reject('IDEMPOTENCY_CONFLICT', 409);
      if (admitted.kind === 'IN_PROGRESS') return reject('OPERATION_IN_PROGRESS', 409);
      if (admitted.kind === 'REPLAY') {
        if (admitted.record.status !== 'SUCCEEDED') return reject(admitted.record.failureCode ?? 'OPERATION_CLOSED', admitted.record.resultHttpStatus ?? 409);
        return this.recover(context, sessionId, identity.idempotencyKey);
      }
      try {
        return await db.transaction(async tx => {
          await activeSession(tx, context, sessionId);
          const current = await target(tx, context, intent.locationId);
          if (current.tenant_id !== scope.tenant_id || current.patient_id !== scope.patient_id) return reject('FORBIDDEN', 403);
          // PostgreSQL interval arithmetic retains input microseconds; clients never supply an end time.
          const eligible = await tx.query<{ starts_at: string; ends_at: string }>(`SELECT
            to_char($4::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS starts_at,
            to_char(($4::timestamptz + interval '30 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ends_at
            FROM doctors d JOIN doctor_working_shifts s ON s.tenant_id=d.tenant_id AND s.doctor_id=d.id AND s.location_id=d.location_id
            WHERE d.tenant_id=$1 AND d.id=$2 AND d.location_id=$3 AND d.status='ACTIVE' AND s.status='ACTIVE'
              AND $4::timestamptz>clock_timestamp() AND s.start_time<=$4::timestamptz
              AND s.end_time>=$4::timestamptz + interval '30 minutes'
            ORDER BY s.id LIMIT 1 FOR SHARE OF d,s`, [scope.tenant_id,intent.doctorId,intent.locationId,intent.startsAt]);
          const slot = eligible.rows[0];
          if (!slot) return reject('VALIDATION_ERROR', 400);
          assertAppointmentTimeRange(slot.starts_at, slot.ends_at);
          const appointment = await new PostgresAppointmentRepository(tx).create({ tenantId: scope.tenant_id, actorId: context.actor!.userId,
            appointment: { tenantId: scope.tenant_id, patientId: scope.patient_id, locationId: intent.locationId, doctorId: intent.doctorId,
              startTime: slot.starts_at, endTime: slot.ends_at, status: 'PENDING', checkedInAt: null, reason: intent.reason,
              notes: '', createdBy: context.actor!.userId } });
          const event = buildAuditEvent({ id: randomUUID(), tenantId: scope.tenant_id, actorId: context.actor!.userId, sessionId,
            action: 'appointment.created', resourceType: 'APPOINTMENT', resourceId: appointment.id, resourceVersion: appointment.version,
            operationId: admitted.record.operationId, result: 'SUCCESS', requestId: context.requestId, correlationId: context.correlationId, metadata: {} });
          if ((await new PostgresAuditEventRepository(tx).append(event)).kind !== 'APPENDED') throw new Error('Mandatory booking audit unavailable');
          return receipt(await new PostgresOperationStore(tx).complete(admitted.record, { resultResourceType: 'APPOINTMENT',
            resultResourceId: appointment.id, resultResourceVersion: appointment.version, resultHttpStatus: 201 }));
        });
      } catch (error) {
        const known = error instanceof AppointmentSchedulingConflictError ? new PatientCommandError('CONFLICT', 409) : error;
        // Unknown commit/transport/audit failures remain PROCESSING for reconciliation, never automatically retried.
        if (known instanceof PatientCommandError) await operations.fail(admitted.record, { failureCode: known.code, resultHttpStatus: known.status });
        throw known;
      }
    },
    async recover(context: RequestContext, sessionId: string, key: string) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) return reject('VALIDATION_ERROR', 400);
      return db.transaction(async tx => {
        await activeSession(tx, context, sessionId);
        const links = await resolveSelfPatients(tx, context);
        const found: OperationRecord[] = [];
        for (const link of links) {
          const record = await new PostgresOperationStore(tx).find({ tenantId: link.tenantId, actorId: context.actor!.userId, idempotencyKey: key });
          if (record) found.push(record);
        }
        if (found.length !== 1) return reject('NOT_FOUND', 404);
        const record = found[0]!;
        if (record.status !== 'SUCCEEDED') return reject(record.failureCode ?? 'OPERATION_IN_PROGRESS', record.resultHttpStatus ?? 409);
        const owned = await tx.query(`SELECT a.id FROM appointments a JOIN patients p ON p.id=a.patient_id AND p.tenant_id=a.tenant_id
          JOIN tenants t ON t.id=p.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 AND p.user_id=$3 AND p.status='ACTIVE' AND t.status='ACTIVE'
          FOR SHARE OF a,p,t`, [record.resultResourceId,record.tenantId,context.actor!.userId]);
        if (!owned.rows.length || record.resultResourceType !== 'APPOINTMENT') return reject('FORBIDDEN', 403);
        if (Date.now() - record.updatedAt.getTime() >= 86400000) return reject('OPERATION_EXPIRED', 409);
        if ((await new PostgresAuditEventRepository(tx).append(buildAuditEvent({ id: randomUUID(), tenantId:record.tenantId,
          actorId:context.actor!.userId,sessionId,operationId:record.operationId,action:'appointment.recovered.self',resourceType:'APPOINTMENT',
          resourceId:record.resultResourceId!,result:'SUCCESS',requestId:context.requestId,correlationId:context.correlationId,metadata:{} }))).kind !== 'APPENDED')
          throw new Error('Mandatory recovery audit unavailable');
        return receipt(record);
      });
    },
    async options(context: RequestContext) {
      await resolveSelfPatients(db, context);
      const rows = await db.query<{ doctor_id:string;location_id:string;doctor_name:string;location_name:string;clinic_name:string;starts_at:string }>(`SELECT DISTINCT
        d.id AS doctor_id,l.id AS location_id,d.display_name AS doctor_name,l.name AS location_name,t.name AS clinic_name,
        to_char(slot AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS starts_at
        FROM patients p JOIN tenants t ON t.id=p.tenant_id JOIN locations l ON l.tenant_id=t.id
        JOIN doctors d ON d.tenant_id=t.id AND d.location_id=l.id
        JOIN doctor_working_shifts s ON s.tenant_id=t.id AND s.doctor_id=d.id AND s.location_id=l.id
        CROSS JOIN LATERAL generate_series(greatest(s.start_time,date_trunc('hour',now())),least(s.end_time-interval '30 minutes',now()+interval '7 days'),interval '30 minutes') slot
        WHERE p.user_id=$1 AND p.status='ACTIVE' AND t.status='ACTIVE' AND l.status='ACTIVE' AND d.status='ACTIVE' AND s.status='ACTIVE'
          AND slot>now() AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id=d.id
            AND a.status IN ('PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS') AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(slot,slot+interval '30 minutes','[)'))
        ORDER BY starts_at,doctor_id,location_id LIMIT 200`, [context.actor!.userId]);
      return { data: rows.rows.map(r => ({ doctorId:r.doctor_id,locationId:r.location_id,doctorName:r.doctor_name,
        locationName:r.location_name,clinicName:r.clinic_name,startsAt:r.starts_at })), durationMinutes:30 };
    },
  };
}
