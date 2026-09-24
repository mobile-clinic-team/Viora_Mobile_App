export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface AuditEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly sessionId?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceVersion?: bigint | null;
  readonly result: AuditResult;
  readonly requestId: string;
  readonly correlationId: string;
  readonly operationId?: string | null;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly createdAt: string;
}

export type AuditEventInput = Omit<AuditEvent, 'createdAt'> & { readonly createdAt?: string };
