import type { EncounterReadRepository, ClinicalRecordReadRepository } from '../../domain/src/read-ports.ts';
import { randomUUID } from 'node:crypto';
import type { TransactionalDatabase } from '../../../platform/database/src/index.ts';
import { mapFirstPostgresRow, mapPostgresRow } from '../../../platform/database/src/row-values.ts';
import type { EncounterRepository, MedicalRecordRepository } from '../../domain/src/repository-ports.ts';
import type { ClinicalRecordWithVersion, Encounter, MedicalRecord, MedicalRecordVersion } from '../../domain/src/index.ts';

export class PostgresEncounterRepository implements EncounterRepository {
  private readonly database: TransactionalDatabase;
  public constructor(database: TransactionalDatabase) { this.database = database; }
  public async listByPatient(input: Parameters<EncounterReadRepository['listByPatient']>[0]) {
    const result = await this.database.query(`SELECT *, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM encounters
      WHERE tenant_id=$1 AND patient_id=$2 AND ($3::timestamptz IS NULL OR (encounters.created_at,encounters.id)<($3::timestamptz,$4::uuid))
      ORDER BY encounters.created_at DESC,encounters.id DESC LIMIT $5`, [input.tenantId,input.patientId,input.after?.[0] ?? null,input.after?.[1] ?? null,input.limit]);
    return result.rows.map(row => mapPostgresRow<Encounter>(row, 'encounterId'));
  }
  public async create(input: Parameters<EncounterRepository['create']>[0]) {
    const result = await this.database.query(`INSERT INTO encounters
      (id,tenant_id,patient_id,appointment_id,doctor_id,started_at,status,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,CURRENT_TIMESTAMP),'OPEN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,
    [randomUUID(), input.tenantId, input.patientId, input.appointmentId ?? null, input.doctorId, input.startedAt ?? null]);
    return mapPostgresRow<Encounter>(result.rows[0], 'encounterId');
  }
  public async findById(input: Parameters<EncounterRepository['findById']>[0]) {
    const result = await this.database.query('SELECT * FROM encounters WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.encounterId]);
    return mapFirstPostgresRow<Encounter>(result.rows, 'encounterId');
  }
}

export class PostgresMedicalRecordRepository implements MedicalRecordRepository {
  private readonly database: TransactionalDatabase;
  public constructor(database: TransactionalDatabase) { this.database = database; }
  public async findById(input: Parameters<MedicalRecordRepository['findById']>[0]) {
    const result = await this.database.query('SELECT * FROM medical_records WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.medicalRecordId]);
    return mapFirstPostgresRow<MedicalRecord>(result.rows, 'medicalRecordId');
  }
  public async findByEncounter(input: Parameters<MedicalRecordRepository['findByEncounter']>[0]) {
    const result = await this.database.query('SELECT * FROM medical_records WHERE tenant_id=$1 AND encounter_id=$2', [input.tenantId, input.encounterId]);
    return mapFirstPostgresRow<MedicalRecord>(result.rows, 'medicalRecordId');
  }
  public async findVersion(input: Parameters<ClinicalRecordReadRepository['findVersion']>[0]) {
    const result = await this.database.query('SELECT * FROM medical_record_versions WHERE tenant_id=$1 AND medical_record_id=$2 AND id=$3', [input.tenantId,input.medicalRecordId,input.versionId]);
    return mapFirstPostgresRow<MedicalRecordVersion>(result.rows, 'versionId');
  }
  public async listVersions(input: Parameters<ClinicalRecordReadRepository['listVersions']>[0]) {
    const result = await this.database.query(`SELECT * FROM medical_record_versions WHERE tenant_id=$1 AND medical_record_id=$2
      AND ($3::bigint IS NULL OR version<$3) ORDER BY version DESC LIMIT $4`, [input.tenantId,input.medicalRecordId,input.after?.[0] ?? null,input.limit]);
    return result.rows.map(row => mapPostgresRow<MedicalRecordVersion>(row, 'versionId'));
  }
  public async findCurrentVersion(input: Parameters<MedicalRecordRepository['findCurrentVersion']>[0]) {
    const result = await this.database.query(`SELECT v.* FROM medical_record_versions v
      JOIN medical_records r ON r.id=v.medical_record_id AND r.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.medical_record_id=$2 AND v.version=r.current_version`, [input.tenantId, input.medicalRecordId]);
    return mapFirstPostgresRow<MedicalRecordVersion>(result.rows, 'versionId');
  }
  public async createWithInitialVersion(input: Parameters<MedicalRecordRepository['createWithInitialVersion']>[0]) {
    return this.database.transaction(async tx => {
      const recordId = randomUUID(); const versionId = randomUUID();
      const record = await tx.query(`INSERT INTO medical_records
        (id,tenant_id,patient_id,encounter_id,status,current_version,created_at,updated_at)
        VALUES($1,$2,$3,$4,'DRAFT',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,
      [recordId, input.tenantId, input.encounter.patientId, input.encounter.encounterId]);
      const version = await tx.query(`INSERT INTO medical_record_versions
        (id,tenant_id,medical_record_id,version,diagnosis,symptoms,clinical_notes,treatment_plan,created_by,created_at)
        VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP) RETURNING *`,
      [versionId, input.tenantId, recordId, input.content.diagnosis, input.content.symptoms, input.content.clinicalNotes, input.content.treatmentPlan, input.actorId]);
      return { record: mapPostgresRow<MedicalRecord>(record.rows[0], 'medicalRecordId'), version: mapPostgresRow<MedicalRecordVersion>(version.rows[0], 'versionId') } as ClinicalRecordWithVersion;
    });
  }
  public async transition(input: Parameters<MedicalRecordRepository['transition']>[0]) {
    const result = await this.database.query(`UPDATE medical_records SET status=$4, reviewed_version=CASE WHEN $4='IN_REVIEW' THEN current_version ELSE reviewed_version END,
      updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status=$3 RETURNING *`, [input.tenantId, input.medicalRecordId, input.from, input.to]);
    return mapFirstPostgresRow<MedicalRecord>(result.rows, 'medicalRecordId');
  }
  public async createAmendment(input: Parameters<MedicalRecordRepository['createAmendment']>[0]) {
    return this.database.transaction(async tx => {
      const next = input.currentVersion.version + 1n;
      const version = await tx.query(`INSERT INTO medical_record_versions
        (id,tenant_id,medical_record_id,version,diagnosis,symptoms,clinical_notes,treatment_plan,created_by,amendment_reason,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP) RETURNING *`,
      [randomUUID(), input.tenantId, input.record.medicalRecordId, next.toString(), input.content.diagnosis, input.content.symptoms, input.content.clinicalNotes, input.content.treatmentPlan, input.actorId, input.content.amendmentReason]);
      const record = await tx.query(`UPDATE medical_records SET status='AMENDED',current_version=$3,updated_at=CURRENT_TIMESTAMP
        WHERE tenant_id=$1 AND id=$2 AND current_version=$4 RETURNING *`, [input.tenantId, input.record.medicalRecordId, next.toString(), input.currentVersion.version.toString()]);
      const mappedRecord = mapFirstPostgresRow<MedicalRecord>(record.rows, 'medicalRecordId');
      if (!mappedRecord) throw new Error('medical record update conflict');
      return { record: mappedRecord, version: mapPostgresRow<MedicalRecordVersion>(version.rows[0], 'versionId') } as ClinicalRecordWithVersion;
    });
  }
}
