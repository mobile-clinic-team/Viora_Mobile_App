import type { PatientDirectoryQuery } from '../../contracts/src/index.ts';
import type { PatientDirectoryPosition, PatientDirectoryRepository } from '../../domain/src/repository-ports.ts';
import type { Patient } from '../../domain/src/index.ts';
import type { RequestContext } from '../../../platform/context/src/index.ts';
import { authorizeResourceAccess } from '../../../platform/authorization/src/index.ts';
import { PatientApplicationError, type PatientAuthorization } from './index.ts';

export const PATIENT_DIRECTORY_SORT = 'fullName:asc,id:asc';

export interface PatientDirectoryCursorContext {
  readonly tenantId: string;
  readonly permissionRevision: string;
  readonly normalizedQuery: string;
  readonly sort: string;
}

export interface PatientDirectoryCursorCodec {
  encode(context: PatientDirectoryCursorContext, position: PatientDirectoryPosition): string;
  decode(cursor: string, context: PatientDirectoryCursorContext): PatientDirectoryPosition;
}

export class PatientDirectoryCursorError extends Error {
  public readonly code: 'INVALID_PAGINATION_CURSOR' | 'CONTEXT_STALE' | 'CURSOR_NOT_CONFIGURED';
  public constructor(code: PatientDirectoryCursorError['code']) {
    super(code);
    this.name = 'PatientDirectoryCursorError';
    this.code = code;
  }
}

export interface PatientDirectoryDependencies {
  readonly patients: PatientDirectoryRepository;
  readonly authorization: PatientAuthorization;
  readonly patientDirectoryCursor: PatientDirectoryCursorCodec | null;
}

export function normalizePatientDirectoryQuery(input: unknown): PatientDirectoryQuery & { readonly limit: number } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PatientApplicationError('VALIDATION_ERROR');
  const query = input as Record<string, unknown>;
  if (Object.keys(query).some(key => !['q', 'limit', 'cursor'].includes(key)) || typeof query.q !== 'string') {
    throw new PatientApplicationError('VALIDATION_ERROR');
  }
  const q = query.q.trim();
  const length = Array.from(q).length;
  const limit = query.limit === undefined ? 20 : query.limit;
  if (length < 2 || length > 100 || typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new PatientApplicationError('VALIDATION_ERROR');
  }
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !query.cursor || query.cursor.length > 16384)) {
    throw new PatientDirectoryCursorError('INVALID_PAGINATION_CURSOR');
  }
  return { q, limit, ...(query.cursor === undefined ? {} : { cursor: query.cursor as string }) };
}

/** Internal domain result only; callers must apply authorized response projection. */
export async function searchPatientDirectory(
  dependencies: PatientDirectoryDependencies,
  context: RequestContext,
  input: PatientDirectoryQuery,
): Promise<{ readonly data: readonly Patient[]; readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean } }> {
  const tenant = context.tenant;
  if (!tenant?.tenantId || !context.actor?.userId || !tenant.permissionRevision) throw new PatientApplicationError('FORBIDDEN');
  const allowed = await dependencies.authorization.allows({ action: 'patient.read', context });
  const decision = authorizeResourceAccess({
    action: 'patient.read', context, resource: { tenantId: tenant.tenantId, resourceId: tenant.tenantId },
    policy: () => allowed === true,
  });
  if (!decision.allowed) throw new PatientApplicationError('FORBIDDEN');
  const query = normalizePatientDirectoryQuery(input);
  const codec = dependencies.patientDirectoryCursor;
  if (!codec) throw new PatientDirectoryCursorError('CURSOR_NOT_CONFIGURED');
  const binding = { tenantId: tenant.tenantId, permissionRevision: tenant.permissionRevision,
    normalizedQuery: query.q, sort: PATIENT_DIRECTORY_SORT };
  const after = query.cursor === undefined ? undefined : codec.decode(query.cursor, binding);
  const rows = await dependencies.patients.searchDirectory({ tenantId: tenant.tenantId, q: query.q, limit: query.limit + 1, after });
  for (const patient of rows) {
    if (patient.tenantId !== tenant.tenantId ||
        !await dependencies.authorization.allows({ action: 'patient.read', context, patient })) {
      throw new PatientApplicationError('FORBIDDEN');
    }
  }
  const hasMore = rows.length > query.limit;
  const data = rows.slice(0, query.limit);
  const last = data.at(-1);
  return { data, page: { hasMore, nextCursor: hasMore && last
    ? codec.encode(binding, { fullName: last.fullName, patientId: last.patientId }) : null } };
}
