import type { DoctorReadRepository, ShiftReadRepository } from '../../domain/src/read-ports.ts';
import type { DatabaseSession } from '../../../platform/database/src/index.ts';
import { mapFirstPostgresRow, mapPostgresRow } from '../../../platform/database/src/row-values.ts';
import type { DepartmentRepository, DoctorRepository, ShiftRepository } from '../../domain/src/repository-ports.ts';
import type { Department, Doctor, DoctorWorkingShift } from '../../domain/src/index.ts';

export class PostgresDoctorRepository implements DoctorRepository {
  private readonly database: DatabaseSession;
  public constructor(database: DatabaseSession) { this.database = database; }
  public async directory(input: Parameters<DoctorReadRepository['directory']>[0]) {
    const result = await this.database.query(`SELECT * FROM doctors WHERE tenant_id=$1
      AND ($2::uuid IS NULL OR location_id=$2) AND ($3::doctor_status IS NULL OR status=$3)
      AND ($4::text IS NULL OR strpos(lower(display_name),lower($4))>0)
      AND ($5::text IS NULL OR (display_name,id)>($5::text,$6::uuid)) ORDER BY display_name ASC,id ASC LIMIT $7`,
      [input.tenantId,input.locationId ?? null,input.status ?? null,input.q ?? null,input.after?.[0] ?? null,input.after?.[1] ?? null,input.limit]);
    return result.rows.map(row => mapPostgresRow<Doctor>(row));
  }
  public async findById(input: Parameters<DoctorRepository['findById']>[0]) {
    const result = await this.database.query('SELECT * FROM doctors WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.doctorId]);
    return mapFirstPostgresRow<Doctor>(result.rows);
  }
  public async listByTenant(input: Parameters<DoctorRepository['listByTenant']>[0]) {
    const result = await this.database.query(`SELECT * FROM doctors WHERE tenant_id=$1
      AND ($2::uuid IS NULL OR department_id=$2) AND ($3::uuid IS NULL OR location_id=$3)
      AND ($4::doctor_status IS NULL OR status=$4) AND ($5::text IS NULL OR strpos(lower(display_name),lower($5))>0)
      AND ($6::uuid IS NULL OR id>$6) ORDER BY id LIMIT $7`,
    [input.tenantId, input.departmentId ?? null, input.locationId ?? null, input.status ?? null, input.search ?? null, input.cursor ?? null, input.limit ?? 20]);
    return result.rows.map(row => mapPostgresRow<Doctor>(row));
  }
}

export class PostgresDepartmentRepository implements DepartmentRepository {
  private readonly database: DatabaseSession;
  public constructor(database: DatabaseSession) { this.database = database; }
  public async listByTenant(input: Parameters<DepartmentRepository['listByTenant']>[0]) {
    const result = await this.database.query(`SELECT * FROM departments WHERE tenant_id=$1
      AND ($2::department_status IS NULL OR status=$2) AND ($3::text IS NULL OR strpos(lower(name),lower($3))>0)
      AND ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT $5`,
    [input.tenantId, input.status ?? null, input.search ?? null, input.cursor ?? null, input.limit ?? 20]);
    return result.rows.map(row => mapPostgresRow<Department>(row));
  }
}

export class PostgresShiftRepository implements ShiftRepository {
  private readonly database: DatabaseSession;
  public constructor(database: DatabaseSession) { this.database = database; }
  public async directory(input: Parameters<ShiftReadRepository['directory']>[0]) {
    const result = await this.database.query(`SELECT *, to_char(start_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS start_time FROM doctor_working_shifts
      WHERE tenant_id=$1 AND doctor_id=$2 AND status='ACTIVE' AND start_time >= $3 AND start_time < $4
      AND ($5::uuid IS NULL OR location_id=$5)
      AND ($6::timestamptz IS NULL OR (doctor_working_shifts.start_time,doctor_working_shifts.id)>($6::timestamptz,$7::uuid)) ORDER BY doctor_working_shifts.start_time ASC,doctor_working_shifts.id ASC LIMIT $8`,
      [input.tenantId,input.doctorId,input.from,input.to,input.locationId ?? null,input.after?.[0] ?? null,input.after?.[1] ?? null,input.limit]);
    return result.rows.map(row => mapPostgresRow<DoctorWorkingShift>(row));
  }
  public async listByDoctor(input: Parameters<ShiftRepository['listByDoctor']>[0]) {
    const result = await this.database.query(`SELECT * FROM doctor_working_shifts WHERE tenant_id=$1 AND doctor_id=$2
      AND ($3::uuid IS NULL OR location_id=$3) AND ($4::doctor_shift_status IS NULL OR status=$4)
      AND ($5::timestamptz IS NULL OR end_time>$5) AND ($6::timestamptz IS NULL OR start_time<$6)
      AND ($7::uuid IS NULL OR id>$7) ORDER BY id LIMIT $8`,
    [input.tenantId, input.doctorId, input.locationId ?? null, input.status ?? null, input.from ?? null, input.to ?? null, input.cursor ?? null, input.limit ?? 20]);
    return result.rows.map(row => mapPostgresRow<DoctorWorkingShift>(row));
  }
}
