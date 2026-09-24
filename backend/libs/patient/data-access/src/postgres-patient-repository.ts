import { randomUUID } from 'node:crypto';
import type { DatabaseSession } from '../../../platform/database/src/index.ts';
import { mapFirstPostgresRow, mapPostgresRow } from '../../../platform/database/src/row-values.ts';
import { PatientMedicalRecordNumberConflictError, type PatientRepository, type PatientDirectoryRepository } from '../../domain/src/repository-ports.ts';
import type { Patient } from '../../domain/src/index.ts';

const columns = `id, tenant_id, user_id, medical_record_number, full_name,
  date_of_birth::text, sex, phone, email, address, emergency_contact, status,
  version, created_at, updated_at, emergency_contact_details`;

export class PostgresPatientRepository implements PatientRepository, PatientDirectoryRepository {
  private readonly database: DatabaseSession;
  public constructor(database: DatabaseSession) { this.database = database; }
  public async searchDirectory(input: Parameters<PatientDirectoryRepository['searchDirectory']>[0]) {
    // Preserve existing literal, case-insensitive full-name substring search.
    // The keyset comparison and ordering use the same database collation.
    const result = await this.database.query(`SELECT ${columns} FROM patients
      WHERE tenant_id=$1 AND strpos(lower(full_name),lower($2))>0
      AND ($3::text IS NULL OR (full_name, id) > ($3::text, $4::uuid))
      ORDER BY full_name ASC, id ASC LIMIT $5`,
    [input.tenantId, input.q, input.after?.fullName ?? null, input.after?.patientId ?? null, input.limit]);
    return result.rows.map(row => mapPostgresRow<Patient>(row, 'patientId'));
  }
  public async findById(input: Parameters<PatientRepository['findById']>[0]) {
    const result = await this.database.query(`SELECT ${columns} FROM patients WHERE tenant_id=$1 AND id=$2`, [input.tenantId, input.patientId]);
    return mapFirstPostgresRow<Patient>(result.rows, 'patientId');
  }
  public async findByMedicalRecordNumber(input: Parameters<PatientRepository['findByMedicalRecordNumber']>[0]) {
    const result = await this.database.query(`SELECT ${columns} FROM patients WHERE tenant_id=$1 AND medical_record_number=$2`, [input.tenantId, input.medicalRecordNumber]);
    return mapFirstPostgresRow<Patient>(result.rows, 'patientId');
  }
  public async listByTenant(input: Parameters<PatientRepository['listByTenant']>[0]) {
    const result = await this.database.query(`SELECT ${columns} FROM patients
      WHERE tenant_id=$1 AND ($2::text IS NULL OR medical_record_number=$2)
      AND ($3::text IS NULL OR strpos(lower(full_name),lower($3))>0)
      AND ($4::date IS NULL OR date_of_birth=$4) AND ($5::text IS NULL OR phone=$5)
      AND ($6::text IS NULL OR email=$6) AND ($7::uuid IS NULL OR id>$7)
      ORDER BY id LIMIT $8`, [input.tenantId, input.medicalRecordNumber ?? null, input.fullName ?? null,
      input.dateOfBirth ?? null, input.phone ?? null, input.email ?? null, input.cursor ?? null, input.limit]);
    return result.rows.map(row => mapPostgresRow<Patient>(row, 'patientId'));
  }
  public async create(input: Parameters<PatientRepository['create']>[0]) {
    const p = input.patient;
    try {
      const result = await this.database.query(`INSERT INTO patients
        (id,tenant_id,user_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,version,created_at,updated_at,emergency_contact_details)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$13::jsonb)
        RETURNING ${columns}`, [randomUUID(), input.tenantId, p.userId, p.medicalRecordNumber, p.fullName,
        p.dateOfBirth, p.sex, p.phone, p.email, p.address, p.emergencyContact, p.status,
        p.emergencyContactDetails === undefined || p.emergencyContactDetails === null ? null : JSON.stringify(p.emergencyContactDetails)]);
      return mapPostgresRow<Patient>(result.rows[0], 'patientId');
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'patients_tenant_medical_record_number_key'
      ) {
        throw new PatientMedicalRecordNumberConflictError();
      }
      throw error;
    }
  }
  public async update(input: Parameters<PatientRepository['update']>[0]) {
    const p = input.changes;
    const result = await this.database.query(`UPDATE patients SET
      full_name=COALESCE($4,full_name),date_of_birth=COALESCE($5::date,date_of_birth),
      sex=COALESCE($6,sex),phone=COALESCE($7,phone),email=COALESCE($8,email),
      address=COALESCE($9,address),emergency_contact=COALESCE($10,emergency_contact),
      status=COALESCE($11,status),version=version+1,updated_at=CURRENT_TIMESTAMP,
      emergency_contact_details=CASE WHEN $12::boolean THEN $13::jsonb ELSE emergency_contact_details END
      WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING ${columns}`,
    [input.tenantId, input.patientId, input.expectedVersion.toString(), p.fullName ?? null,
      p.dateOfBirth ?? null, p.sex ?? null, p.phone ?? null, p.email ?? null, p.address ?? null,
      p.emergencyContact ?? null, p.status ?? null, p.emergencyContactDetails !== undefined,
      p.emergencyContactDetails == null ? null : JSON.stringify(p.emergencyContactDetails)]);
    return mapFirstPostgresRow<Patient>(result.rows, 'patientId');
  }
}
