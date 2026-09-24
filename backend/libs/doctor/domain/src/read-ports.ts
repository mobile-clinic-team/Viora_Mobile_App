import type { Doctor, DoctorWorkingShift } from './index.ts';
import type { DoctorStatus } from '../../contracts/src/index.ts';
interface PageQuery { readonly limit?: number; readonly cursor?: string }
export interface DoctorDirectoryQuery extends PageQuery { readonly q?: string; readonly locationId?: string; readonly status?: DoctorStatus }
export interface DoctorReadRepository {
  findById(input: { readonly tenantId: string; readonly doctorId: string }): Promise<Doctor | null>;
  directory(input: DoctorDirectoryQuery & { readonly tenantId: string; readonly limit: number; readonly after?: readonly string[] }): Promise<readonly Doctor[]>;
}
export interface ShiftReadRepository {
  directory(input: { readonly tenantId: string; readonly doctorId: string; readonly from: string; readonly to: string; readonly locationId?: string; readonly limit: number; readonly after?: readonly string[] }): Promise<readonly DoctorWorkingShift[]>;
}
