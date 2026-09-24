import type { AppointmentReadRepository } from '../../domain/src/read-ports.ts';
import { randomUUID } from 'node:crypto';
import type { DatabaseSession } from '../../../platform/database/src/index.ts';
import { mapFirstPostgresRow, mapPostgresRow } from '../../../platform/database/src/row-values.ts';
import { AppointmentSchedulingConflictError, type AppointmentRepository } from '../../domain/src/repository-ports.ts';
import type { Appointment } from '../../domain/src/index.ts';

export class PostgresAppointmentRepository implements AppointmentRepository {
  private readonly database: DatabaseSession;
  public constructor(database: DatabaseSession) { this.database = database; }
  private async mutate(sql: string, values: readonly unknown[]) {
    try { return mapFirstPostgresRow<Appointment>((await this.database.query(sql, values)).rows); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23P01') throw new AppointmentSchedulingConflictError();
      throw error;
    }
  }
  public async findById(input: Parameters<AppointmentRepository['findById']>[0]) {
    return mapFirstPostgresRow<Appointment>((await this.database.query('SELECT * FROM appointments WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.appointmentId])).rows);
  }
  public async directory(input: Parameters<AppointmentReadRepository['directory']>[0]) {
    const result = await this.database.query(`SELECT *, to_char(start_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS start_time FROM appointments WHERE tenant_id=$1
      AND start_time >= $2 AND start_time < $3 AND ($4::uuid IS NULL OR doctor_id=$4)
      AND ($5::uuid IS NULL OR patient_id=$5) AND ($6::uuid IS NULL OR location_id=$6)
      AND ($7::appointment_status IS NULL OR status=$7)
      AND ($8::timestamptz IS NULL OR (appointments.start_time,appointments.id)>($8::timestamptz,$9::uuid)) ORDER BY appointments.start_time ASC,appointments.id ASC LIMIT $10`,
      [input.tenantId,input.from,input.to,input.doctorId ?? null,input.patientId ?? null,input.locationId ?? null,input.status ?? null,input.after?.[0] ?? null,input.after?.[1] ?? null,input.limit]);
    return result.rows.map(row => mapPostgresRow<Appointment>(row));
  }
  public async listByTenant(input: Parameters<AppointmentRepository['listByTenant']>[0]) {
    const result = await this.database.query(`SELECT * FROM appointments WHERE tenant_id=$1
      AND ($2::uuid IS NULL OR patient_id=$2) AND ($3::uuid IS NULL OR doctor_id=$3)
      AND ($4::uuid IS NULL OR location_id=$4) AND ($5::appointment_status IS NULL OR status=$5)
      AND ($6::timestamptz IS NULL OR start_time>=$6) AND ($7::timestamptz IS NULL OR start_time<$7)
      AND ($8::uuid IS NULL OR id>$8) ORDER BY id LIMIT $9`,
    [input.tenantId, input.patientId ?? null, input.doctorId ?? null, input.locationId ?? null, input.status ?? null, input.from ?? null, input.to ?? null, input.cursor ?? null, input.limit ?? 20]);
    return result.rows.map(row => mapPostgresRow<Appointment>(row));
  }
  public async create(input: Parameters<AppointmentRepository['create']>[0]) {
    const a = input.appointment;
    // Composite FKs in migration 013 enforce all referenced resources' tenant.
    const result = await this.mutate(`INSERT INTO appointments
      (id,tenant_id,location_id,patient_id,doctor_id,start_time,end_time,status,checked_in_at,reason,notes,created_by,version,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,
    [randomUUID(), input.tenantId, a.locationId, a.patientId, a.doctorId, a.startTime, a.endTime, a.status, a.checkedInAt, a.reason, a.notes, input.actorId]);
    if (!result) throw new Error('Appointment insert did not return a row');
    return result;
  }
  public async update(input: Parameters<AppointmentRepository['update']>[0]) {
    const a = input.changes;
    return this.mutate(`UPDATE appointments SET location_id=COALESCE($4::uuid,location_id),
      doctor_id=COALESCE($5::uuid,doctor_id),start_time=COALESCE($6::timestamptz,start_time),
      end_time=COALESCE($7::timestamptz,end_time),reason=COALESCE($8,reason),notes=COALESCE($9,notes),
      version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING *`,
    [input.tenantId, input.appointmentId, input.expectedVersion.toString(), a.locationId ?? null, a.doctorId ?? null, a.startTime ?? null, a.endTime ?? null, a.reason ?? null, a.notes ?? null]);
  }
  public async updateStatus(input: Parameters<AppointmentRepository['updateStatus']>[0]) {
    return this.mutate(`UPDATE appointments SET status=$4,checked_in_at=COALESCE($5::timestamptz,checked_in_at),
      version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING *`,
    [input.tenantId, input.appointmentId, input.expectedVersion.toString(), input.status, input.checkedInAt ?? null]);
  }
}
