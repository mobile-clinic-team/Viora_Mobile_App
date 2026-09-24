import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveGrants, withinRoleCeiling } from './authorization-policy.ts';
import { createPatientAuthorization } from './patient-authorization.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';

test('ceilings never supply grants; unknown and out-of-ceiling stored grants confer no authority', () => {
  assert.deepEqual([...effectiveGrants(['DOCTOR'], [])], []);
  assert.deepEqual([...effectiveGrants(['CLINIC_ADMIN'], ['patient.read', 'record.read', '*', 'access.manage'])], ['patient.read']);
  for (const role of ['ADMIN', 'CLINICIAN', 'UNKNOWN', 'constructor', '__proto__']) {
    assert.equal(withinRoleCeiling([role], 'patient.read'), false);
  }
  assert.deepEqual([...effectiveGrants(['RECEPTIONIST', 'DOCTOR'], ['record.read', 'patient.read'])], ['record.read', 'patient.read']);
  assert.equal(withinRoleCeiling(['NURSE'], 'draft.approve'), false);
});

test('normal Patient resource checks deny missing durable Doctor relationship and unresolved receptionist purpose', () => {
  const authorization = createPatientAuthorization(new Set(['patient.read', 'patient.create', 'patient.update']));
  for (const roles of [[], ['DOCTOR'], ['RECEPTIONIST'], ['UNKNOWN'], ['CLINIC_ADMIN'], ['NURSE'], ['DOCTOR', 'CLINIC_ADMIN']]) {
    const context = createAuthenticatedRequestContext({ requestId: 'r', correlationId: 'c', userId: 'u', subject: 's',
      tenantId: 't', membershipId: 'm', permissionRevision: '"1"', roles });
    assert.equal(authorization.allows({ action: 'patient.read', context }), roles.includes('CLINIC_ADMIN') || roles.includes('NURSE'));
    assert.equal(authorization.allows({ action: 'patient.read', context, patient: { tenantId: 'other' } as never }), false);
    assert.equal(authorization.allows({ action: 'patient.create', context }), false);
    assert.equal(authorization.allows({ action: 'patient.update', context }), false);
  }
});
