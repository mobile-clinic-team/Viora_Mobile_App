import { createNodeAuthTransactionSecretProtector } from '../../../libs/identity/application-entrypoint/src/index.ts';
import {
  PatientDirectoryCursorError,
  type PatientDirectoryCursorCodec,
} from '../../../libs/patient/application-entrypoint/src/index.ts';

/** Separate 32-byte hex key. Missing configuration disables directory reads in every environment. */
export function createPatientDirectoryCursorCodec(encodedKey: string | undefined): PatientDirectoryCursorCodec | null {
  if (encodedKey === undefined || encodedKey.trim() === '') return null;
  if (!/^[0-9a-f]{64}$/i.test(encodedKey)) {
    throw new Error('VIORA_PATIENT_CURSOR_ENCRYPTION_KEY must be 32 bytes encoded as hex');
  }
  // Reuse the existing authenticated encryption primitive with a dedicated key.
  const protector = createNodeAuthTransactionSecretProtector(encodedKey);
  const invalid = () => new PatientDirectoryCursorError('INVALID_PAGINATION_CURSOR');
  return {
    encode(context, position) {
      return protector.protect(JSON.stringify({ version: 1, purpose: 'patient-directory', ...context,
        lastFullName: position.fullName, lastPatientId: position.patientId }));
    },
    decode(cursor, context) {
      let value: Record<string, unknown>;
      try {
        if (cursor.length > 16384) throw invalid();
        const parts = cursor.split('.');
        if (parts.length !== 4 || parts[0] !== 'v1' || parts.slice(1).some(part =>
          !/^[A-Za-z0-9_-]+$/.test(part) || Buffer.from(part, 'base64url').toString('base64url') !== part)) throw invalid();
        const parsed: unknown = JSON.parse(protector.unprotect(cursor));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
        value = parsed as Record<string, unknown>;
        if (value.version !== 1 || value.purpose !== 'patient-directory' ||
            typeof value.lastFullName !== 'string' || typeof value.lastPatientId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.lastPatientId) ||
            typeof value.permissionRevision !== 'string' || !value.permissionRevision ||
            value.tenantId !== context.tenantId || value.normalizedQuery !== context.normalizedQuery || value.sort !== context.sort) throw invalid();
      } catch {
        throw invalid();
      }
      if (value.permissionRevision !== context.permissionRevision) throw new PatientDirectoryCursorError('CONTEXT_STALE');
      return { fullName: value.lastFullName as string, patientId: value.lastPatientId as string };
    },
  };
}
