import type { RequestContext } from './index.ts';

export class ReadError extends Error {
  public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'INVALID_PAGINATION_CURSOR' | 'CONTEXT_STALE' | 'FEATURE_UNAVAILABLE';
  public constructor(code: ReadError['code']) { super(code); this.code = code; }
}
export interface ReadCursorBinding {
  readonly tenantId: string;
  readonly permissionRevision: string;
  readonly query: string;
  readonly sort: string;
  readonly purpose: string;
}
export interface ReadCursorCodec {
  encode(binding: ReadCursorBinding, position: readonly string[]): string;
  decode(cursor: string, binding: ReadCursorBinding): readonly string[];
}
export interface PageQuery { readonly limit?: number; readonly cursor?: string }
export interface ReadPage<T> { readonly data: readonly T[]; readonly page: { readonly hasMore: boolean; readonly nextCursor: string | null } }
export function requireRead(context: RequestContext, permissions: ReadonlySet<string>, permission: string): string {
  if (!context.actor?.userId || !context.actor.subject || !context.tenant?.tenantId || !context.tenant.membershipId || !context.tenant.permissionRevision || !permissions.has(permission)) throw new ReadError('FORBIDDEN');
  return context.tenant.tenantId;
}
export function uuid(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ReadError('VALIDATION_ERROR');
  return value;
}
export function range(from: string, to: string, days: number): void {
  const instant = (value: string) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
  if (!instant(from) || !instant(to) || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > days * 86400000) throw new ReadError('VALIDATION_ERROR');
}
export async function readPage<T>(input: {
  readonly context: RequestContext; readonly codec: ReadCursorCodec | null; readonly query: PageQuery;
  readonly purpose: string; readonly sort: string; readonly filters: Readonly<Record<string, unknown>>;
  readonly load: (limit: number, after?: readonly string[]) => Promise<readonly T[]>;
  readonly position: (row: T) => readonly string[];
}): Promise<ReadPage<T>> {
  const limit = input.query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ReadError('VALIDATION_ERROR');
  if (!input.codec) throw new ReadError('FEATURE_UNAVAILABLE');
  const binding = { tenantId: input.context.tenant!.tenantId, permissionRevision: input.context.tenant!.permissionRevision,
    purpose: input.purpose, sort: input.sort, query: JSON.stringify(input.filters) };
  const after = input.query.cursor === undefined ? undefined : input.codec.decode(input.query.cursor, binding);
  const rows = await input.load(limit + 1, after);
  const data = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { data, page: { hasMore, nextCursor: hasMore && data.length ? input.codec.encode(binding, input.position(data[data.length - 1]!)) : null } };
}
