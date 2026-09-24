import { randomUUID } from 'node:crypto';
import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import { PostgresSessionRepository } from '../../../libs/identity/data-access/src/index.ts';

/** Synthetic fixture; called only by the guarded disposable PostgreSQL test. */
export async function draftFixture(database: TransactionalDatabase) {
      const tenantId = randomUUID(), otherTenant = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
      const patientId = randomUUID(), otherPatient = randomUUID(), deniedPatient = randomUUID(), encounterId = randomUUID();
      const doctorId = randomUUID(), departmentId = randomUUID(), locationId = randomUUID();
      await database.query("INSERT INTO tenants(id,name,status,created_at,updated_at) VALUES($1,'Synthetic A','ACTIVE',now(),now()),($2,'Synthetic B','ACTIVE',now(),now())", [tenantId,otherTenant]);
      await database.query("INSERT INTO users(id,status,created_at,updated_at) VALUES($1,'ACTIVE',now(),now())", [userId]);
      await database.query("INSERT INTO identity_subjects(issuer,subject,user_id,created_at) VALUES('https://synthetic.example.test',$1::text,$1::uuid,now())", [userId]);
      await database.query("INSERT INTO memberships(id,user_id,tenant_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'DOCTOR','ACTIVE',now(),now())", [membershipId,userId,tenantId]);
      for (const [id, tenant] of [[patientId,tenantId],[deniedPatient,tenantId],[otherPatient,otherTenant]]) {
        await database.query("INSERT INTO patients(id,tenant_id,medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status,created_at,updated_at) VALUES($1,$2,$3,'Synthetic Patient','1990-01-01','UNKNOWN','INTERNAL_PHONE','internal@example.test','INTERNAL_ADDRESS','INTERNAL_CONTACT','ACTIVE',now(),now())", [id,tenant,id]);
      }
      await database.query("INSERT INTO patient_care_access(id,tenant_id,patient_id,membership_id,kind,created_by_membership_id) VALUES($1,$2,$3,$4,'DOCTOR_RELATIONSHIP',$4)", [randomUUID(),tenantId,patientId,membershipId]);
      await database.query("INSERT INTO locations(id,tenant_id,name,status,created_at,updated_at) VALUES($1,$2,'Synthetic','ACTIVE',now(),now())", [locationId,tenantId]);
      await database.query("INSERT INTO departments(id,tenant_id,name,description,status,created_at,updated_at) VALUES($1,$2,'Synthetic','Synthetic','ACTIVE',now(),now())", [departmentId,tenantId]);
      await database.query("INSERT INTO doctors(id,tenant_id,user_id,department_id,location_id,license_number,display_name,specialization,bio,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'Synthetic','Synthetic','Synthetic','Synthetic','ACTIVE',now(),now())", [doctorId,tenantId,userId,departmentId,locationId]);
      for (const [id, patient] of [[encounterId,patientId],[randomUUID(),deniedPatient]]) await database.query("INSERT INTO encounters(id,tenant_id,patient_id,doctor_id,started_at,status,created_at,updated_at) VALUES($1,$2,$3,$4,now(),'OPEN',now(),now())", [id,tenantId,patient,doctorId]);
      const now = new Date();
      const accessExpiresAt = new Date(now.getTime()+600_000).toISOString(), expiresAt = new Date(now.getTime()+28_800_000).toISOString();
      await new PostgresSessionRepository(database).create({ sessionId,userId,identityIssuer:'https://synthetic.example.test',identitySubject:userId,accessTokenHash:'11'.repeat(32),refreshTokenHash:'22'.repeat(32),familyId:randomUUID(),refreshTokenId:randomUUID(),createdAt:now.toISOString(),accessExpiresAt,expiresAt });
      const context = createAuthenticatedRequestContext({ requestId:randomUUID(),correlationId:randomUUID(),userId,subject:userId,tenantId,membershipId,permissionRevision:'"1"',roles:['DOCTOR'] });
      const identity = { sessionId,userId,subject:{ issuer:'https://synthetic.example.test',subject:userId },accessExpiresAt,expiresAt };
 return { tenantId, otherTenant, userId, patientId, otherPatient, deniedPatient, encounterId, context, identity };
}

