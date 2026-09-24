import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import type { DraftHumanPolicy } from './ai-draft-review.ts';

/** Exact grants remain independently required by the review runtime. BD-01/04/05:
 * a Doctor must have an active care relationship and an editable existing target. */
export function createDraftHttpPolicy(database: TransactionalDatabase): DraftHumanPolicy {
  return {
    allows: context => context.actor?.kind === 'HUMAN' && (context.tenant?.roles ?? []).includes('DOCTOR'),
    async canEditRecord(context, draft) {
      return Boolean((await database.query(`SELECT r.id FROM medical_records r
        JOIN encounters e ON e.tenant_id=r.tenant_id AND e.id=r.encounter_id AND e.patient_id=r.patient_id
        JOIN patient_care_access a ON a.tenant_id=r.tenant_id AND a.patient_id=r.patient_id
        WHERE r.tenant_id=$1 AND r.id=$2 AND r.patient_id=$3 AND r.encounter_id=$4
          AND r.status='DRAFT' AND e.status='OPEN' AND a.membership_id=$5
          AND a.kind='DOCTOR_RELATIONSHIP' AND a.revoked_at IS NULL`,
      [context.tenant!.tenantId, draft.targetRecordId, draft.patientId, draft.encounterId, context.tenant!.membershipId])).rows[0]);
    },
  };
}
