export interface RequestContext {
  readonly requestId: string;

  readonly correlationId: string;

  readonly actor: {
    readonly userId: string;
    readonly subject: string;
    readonly kind: 'HUMAN' | 'AI';
  } | null;

  readonly tenant: {
    readonly tenantId: string;
    readonly membershipId: string;
    readonly permissionRevision: string;
    /** Loaded from canonical membership state, never from request claims. */
    readonly roles?: readonly string[];
  } | null;
}
