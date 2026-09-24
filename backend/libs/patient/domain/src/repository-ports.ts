import type { PatientReference } from '../../contracts/src/index.ts';

export interface PatientDirectoryPosition {
  readonly fullName: string;
  readonly patientId: string;
}

export interface PatientDirectoryRepository {
  searchDirectory(input: {
    readonly tenantId: string;
    readonly q: string;
    readonly limit: number;
    readonly after?: PatientDirectoryPosition;
  }): Promise<readonly Patient[]>;
}
import type {
  Patient,
  PatientCreate,
  PatientProfileChanges,
} from './index.ts';

/**
 * All Patient persistence operations are tenant-scoped by contract. Concrete
 * adapters must enforce this scope in their persistence query as well.
 */
export class PatientMedicalRecordNumberConflictError extends Error {
  public constructor() {
    super('patient medical record number already exists');
    this.name = 'PatientMedicalRecordNumberConflictError';
  }
}

export interface PatientRepository {
  findById(input: PatientReference): Promise<Patient | null>;
  findByMedicalRecordNumber(input: {
    readonly tenantId: string;
    readonly medicalRecordNumber: string;
  }): Promise<Patient | null>;
  listByTenant(input: {
    readonly tenantId: string;
    readonly medicalRecordNumber?: string;
    readonly fullName?: string;
    readonly dateOfBirth?: string;
    readonly phone?: string;
    readonly email?: string;
    readonly limit: number;
    readonly cursor?: string;
  }): Promise<readonly Patient[]>;
  create(input: {
    readonly tenantId: string;
    readonly patient: PatientCreate;
  }): Promise<Patient>;
  update(input: {
    readonly tenantId: string;
    readonly patientId: string;
    readonly changes: PatientProfileChanges;
    readonly expectedVersion: bigint;
  }): Promise<Patient | null>;
}
