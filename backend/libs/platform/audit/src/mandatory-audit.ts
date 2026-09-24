/** A protected operation cannot disclose success without its required audit. */
export class MandatoryAuditError extends Error {
  public readonly code = 'AUDIT_UNAVAILABLE';
  public constructor() {
    super('AUDIT_UNAVAILABLE');
    this.name = 'MandatoryAuditError';
  }
}
