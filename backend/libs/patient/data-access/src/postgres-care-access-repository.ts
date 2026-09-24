import { randomUUID } from 'node:crypto';
import type { TransactionalDatabase, DatabaseSession } from '../../../platform/database/src/index.ts';
import type { CareAccessReader, CareAccessScope } from '../../domain/src/care-access.ts';

interface ChangeContext {
  readonly actorMembershipId: string;
  readonly actorId: string;
  readonly requestId: string;
  readonly correlationId: string;
}

/** Persistence primitive only. Future authorized workflows must establish management
 * authority before calling create/revoke; these methods are not exposed by HTTP. */
export class PostgresCareAccessRepository implements CareAccessReader {
  private readonly database: TransactionalDatabase;
  public constructor(database: TransactionalDatabase) { this.database = database; }

  public async hasActive(input: CareAccessScope & { readonly userId: string }): Promise<boolean> {
    if (!['DOCTOR_RELATIONSHIP', 'NURSE_ASSIGNMENT'].includes(input.kind)) return false;
    const result = await this.database.query(`SELECT EXISTS (
      SELECT 1 FROM patient_care_access c
      JOIN memberships m ON m.tenant_id=c.tenant_id AND m.id=c.membership_id
      JOIN patients p ON p.tenant_id=c.tenant_id AND p.id=c.patient_id
      WHERE c.tenant_id=$1 AND c.membership_id=$2 AND c.patient_id=$3 AND c.kind=$4
        AND c.revoked_at IS NULL AND c.revoked_by_membership_id IS NULL
        AND m.user_id=$5 AND m.status='ACTIVE'
        AND ((c.kind='DOCTOR_RELATIONSHIP' AND m.role='DOCTOR')
          OR (c.kind='NURSE_ASSIGNMENT' AND m.role='NURSE'))) AS allowed`,
    [input.tenantId, input.membershipId, input.patientId, input.kind, input.userId]);
    return result.rows[0]?.allowed === true;
  }

  public async history(input: CareAccessScope) {
    return (await this.database.query(`SELECT * FROM patient_care_access
      WHERE tenant_id=$1 AND membership_id=$2 AND patient_id=$3 AND kind=$4 ORDER BY created_at,id`,
    [input.tenantId, input.membershipId, input.patientId, input.kind])).rows;
  }

  private async audit(tx: DatabaseSession, input: CareAccessScope & ChangeContext, id: string, operation: 'create' | 'revoke') {
    const actor = await tx.query(`SELECT id FROM memberships
      WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND status='ACTIVE'`,
    [input.tenantId, input.actorMembershipId, input.actorId]);
    if (!actor.rows.length) throw new Error('invalid care state change actor');
    await tx.query(`INSERT INTO audit_events
      (id,tenant_id,actor_id,action,resource_type,resource_id,result,request_id,correlation_id,metadata)
      VALUES($1,$2,$3,$4,'PATIENT_CARE_ACCESS',$5,'SUCCESS',$6,$7,$8::jsonb)`,
    [randomUUID(), input.tenantId, input.actorId, `patient.care_access.${operation}`, id,
      input.requestId, input.correlationId, JSON.stringify({ patientId: input.patientId,
        membershipId: input.membershipId, actorMembershipId: input.actorMembershipId, kind: input.kind, policy: 'BD-01' })]);
  }

  public async create(input: CareAccessScope & ChangeContext): Promise<string> {
    return this.database.transaction(async tx => {
      const id = randomUUID();
      await tx.query(`INSERT INTO patient_care_access
        (id,tenant_id,patient_id,membership_id,kind,created_by_membership_id) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, input.tenantId, input.patientId, input.membershipId, input.kind, input.actorMembershipId]);
      await this.audit(tx, input, id, 'create');
      return id;
    });
  }

  public async revoke(input: CareAccessScope & ChangeContext & { readonly id: string }): Promise<boolean> {
    return this.database.transaction(async tx => {
      const result = await tx.query(`UPDATE patient_care_access
        SET revoked_at=CURRENT_TIMESTAMP,revoked_by_membership_id=$6
        WHERE tenant_id=$1 AND membership_id=$2 AND patient_id=$3 AND kind=$4 AND id=$5
          AND revoked_at IS NULL RETURNING id`,
      [input.tenantId, input.membershipId, input.patientId, input.kind, input.id, input.actorMembershipId]);
      if (!result.rows.length) return false;
      await this.audit(tx, input, input.id, 'revoke');
      return true;
    });
  }
}
