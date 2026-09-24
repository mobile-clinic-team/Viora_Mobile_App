import type { Appointment } from './index.ts';
import type { AppointmentStatus } from '../../contracts/src/index.ts';
export interface AppointmentReadQuery {
  readonly from: string; readonly to: string; readonly doctorId?: string; readonly patientId?: string;
  readonly locationId?: string; readonly status?: AppointmentStatus; readonly limit?: number; readonly cursor?: string;
}
export interface AppointmentReadRepository {
  findById(input: { readonly tenantId: string; readonly appointmentId: string }): Promise<Appointment | null>;
  directory(input: AppointmentReadQuery & { readonly tenantId: string; readonly limit: number; readonly after?: readonly string[] }): Promise<readonly Appointment[]>;
}
