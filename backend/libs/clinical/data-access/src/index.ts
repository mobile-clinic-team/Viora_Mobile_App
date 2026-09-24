export type {
  EncounterRepository,
  MedicalRecordRepository,
} from '../../domain/src/repository-ports.ts';
export { PostgresEncounterRepository, PostgresMedicalRecordRepository } from './postgres-clinical-repositories.ts';
