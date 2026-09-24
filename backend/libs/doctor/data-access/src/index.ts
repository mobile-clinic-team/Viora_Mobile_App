export type {
  DepartmentRepository,
  DoctorRepository,
  ShiftRepository,
} from '../../domain/src/repository-ports.ts';
export { PostgresDoctorRepository, PostgresDepartmentRepository, PostgresShiftRepository } from './postgres-doctor-repositories.ts';
