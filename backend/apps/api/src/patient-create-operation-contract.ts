import { createHash } from 'node:crypto';
import type { OperationRecord } from '../../../libs/platform/idempotency/src/postgres-operation-store.ts';

export class PatientCommandError extends Error {
  public readonly code: string;
  public readonly status: number;
  public replayed = false;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** Input must be parsed JSON. Never normalize domain values before hashing. */
export function canonicalOperationJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalOperationJson).join(',') + ']';
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(key =>
      JSON.stringify(key) + ':' + canonicalOperationJson(object[key])).join(',') + '}';
  }
  throw new PatientCommandError('INVALID_REQUEST', 400);
}

export function parseOperationIdentity(key: unknown, timestamp: unknown): {
  idempotencyKey: string; operationCreatedAt: Date;
} {
  if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key) ||
      typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    throw new PatientCommandError('INVALID_REQUEST', 400);
  }
  const operationCreatedAt = new Date(timestamp);
  if (!Number.isFinite(operationCreatedAt.getTime()) || operationCreatedAt.toISOString() !== timestamp) {
    throw new PatientCommandError('INVALID_REQUEST', 400);
  }
  return { idempotencyKey: key, operationCreatedAt };
}

export function patientCreateFingerprint(body: unknown, operationCreatedAt: Date): string {
  return patientCommandFingerprint(body, operationCreatedAt, 'POST', '/v1/patients', null);
}

export function patientCommandFingerprint(body: unknown, operationCreatedAt: Date,
  method: 'POST' | 'PATCH', path: string, ifMatch: unknown): string {
  return createHash('sha256').update(canonicalOperationJson({
    method, path, body,
    operationCreatedAt: operationCreatedAt.toISOString(),
    ifMatch: ifMatch ?? null, relatedVersionTokens: [],
  })).digest('hex');
}

export interface PatientWriteReceipt {
  operationId: string;
  state: 'SUCCEEDED';
  primary: { type: 'PATIENT'; id: string; parentId: null; versionToken: string };
  related: [];
  handoff: null;
  committedAt: string;
  expiresAt: string;
}

export function patientWriteReceipt(operation: OperationRecord): PatientWriteReceipt {
  if (operation.status !== 'SUCCEEDED' || operation.resultResourceType !== 'PATIENT' ||
      !operation.resultResourceId || operation.resultResourceVersion === null ||
      operation.resultResourceVersion <= 0n || ![200, 201].includes(operation.resultHttpStatus ?? 0)) {
    throw new PatientCommandError('INTERNAL_ERROR', 500);
  }
  return {
    operationId: operation.idempotencyKey, state: 'SUCCEEDED',
    primary: { type: 'PATIENT', id: operation.resultResourceId, parentId: null,
      versionToken: `"${operation.resultResourceVersion}"` },
    related: [], handoff: null, committedAt: operation.updatedAt.toISOString(),
    expiresAt: new Date(operation.updatedAt.getTime() + 86_400_000).toISOString(),
  };
}
