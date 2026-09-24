export { AppointmentSchedulingConflictError } from '../../domain/src/repository-ports.ts';
export { PostgresAppointmentRepository } from './postgres-appointment-repository.ts';
export type {
  AppointmentRepository,
  AppointmentAvailabilityRepository,
} from '../../domain/src/repository-ports.ts';
