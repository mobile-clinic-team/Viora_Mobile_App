import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSession } from '../../../platform/database/src/index.ts';

export interface DraftAssuranceBinding {
  tenantId: string; actorId: string; sessionId: string; draftId: string;
  draftVersion: bigint; targetRecordId: string; targetVersionToken: string;
}
function values(binding: DraftAssuranceBinding) {
  return [binding.tenantId,binding.actorId,binding.sessionId,binding.draftId,
    binding.draftVersion.toString(),binding.targetRecordId,binding.targetVersionToken];
}
/** Persistence only. Issuer must verify server-held OIDC MFA evidence before
 * issue; never expose this method as an HTTP proof or caller-asserted flag. */
export class PostgresDraftAssuranceRepository {
  private readonly db: DatabaseSession;
  constructor(db: DatabaseSession) { this.db=db; }
  async issue(binding: DraftAssuranceBinding): Promise<{ assuranceToken: string; expiresAt: string }> {
    const token = randomBytes(32).toString('base64url');

    const result = await this.db.query(
      `WITH timing AS (
        SELECT clock_timestamp() AS created_at
      )
      INSERT INTO draft_assurance_grants
        (id,token_hash,tenant_id,actor_id,session_id,draft_id,draft_version,
        target_record_id,target_version_token,action,created_at,expires_at)
      SELECT
        $8,
        $9,
        $1,
        $2,
        s.id,
        $4,
        $5,
        $6,
        $7,
        'draft.approve',
        timing.created_at,
        LEAST(
          timing.created_at + interval '2 minutes',
          s.expires_at,
          s.access_expires_at
        )
      FROM sessions s
      CROSS JOIN timing
      WHERE s.id=$3
        AND s.user_id=$2
        AND s.status='ACTIVE'
        AND s.expires_at > timing.created_at
        AND s.access_expires_at > timing.created_at
      RETURNING expires_at`,
      [
        ...values(binding),
        randomUUID(),
        createHash('sha256').update(token).digest(),
      ],
    );

    if (!result.rows[0]) throw new Error('ASSURANCE_REQUIRED');

    return {
      assuranceToken: token,
      expiresAt: new Date(String(result.rows[0].expires_at)).toISOString(),
    };
  }
  async consume(binding: DraftAssuranceBinding, token: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const result=await this.db.query(`UPDATE draft_assurance_grants g SET consumed_at=clock_timestamp()
      FROM sessions s WHERE g.tenant_id=$1 AND g.actor_id=$2 AND g.session_id=$3 AND g.draft_id=$4
        AND g.draft_version=$5 AND g.target_record_id=$6 AND g.target_version_token=$7
        AND g.token_hash=$8 AND g.action='draft.approve' AND g.consumed_at IS NULL AND g.expires_at>clock_timestamp()
        AND s.id=g.session_id AND s.user_id=g.actor_id AND s.status='ACTIVE'
        AND s.expires_at>clock_timestamp() AND s.access_expires_at>clock_timestamp() RETURNING g.id`,
    [...values(binding),createHash('sha256').update(token).digest()]);
    return result.rows.length===1;
  }
}
