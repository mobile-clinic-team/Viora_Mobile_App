import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPatientAuthorization,
} from './patient-authorization.ts';

test(
  'patient authorization allows only exact loaded grants',
  () => {
    const authorization =
      createPatientAuthorization(
        new Set([
          'patient.read',
          'unrelated.permission',
        ]),
      );

    assert.equal(
      authorization.allows({
        action: 'patient.read',
        context: { actor: { userId: 'u' }, tenant: { tenantId: 't', membershipId: 'm', permissionRevision: '"1"', roles: ['CLINIC_ADMIN'] } } as never,
      }),
      true,
    );

    assert.equal(
      authorization.allows({
        action: 'patient.create',
        context: { actor: { userId: 'u' }, tenant: { tenantId: 't', membershipId: 'm', permissionRevision: '"1"', roles: ['CLINIC_ADMIN'] } } as never,
      }),
      false,
    );

    assert.equal(
      authorization.allows({
        action: 'patient.update',
        context: { actor: { userId: 'u' }, tenant: { tenantId: 't', membershipId: 'm', permissionRevision: '"1"', roles: ['CLINIC_ADMIN'] } } as never,
      }),
      false,
    );
  },
);

test(
  'BD-02 unresolved Patient mutation grants remain denied',
  async () => {
    const authorization = createPatientAuthorization(
      new Set([
        'patient.read',
        'patient.create',
        'patient.update',
      ]),
    );

    for (const role of [
      'CLINIC_ADMIN',
      'DOCTOR',
      'NURSE',
      'RECEPTIONIST',
    ]) {
      const context = {
        actor: { userId: 'u' },
        tenant: {
          tenantId: 't',
          membershipId: 'm',
          permissionRevision: '"1"',
          roles: [role],
        },
      } as never;

      assert.equal(
        await authorization.allows({
          action: 'patient.create',
          context,
        }),
        false,
      );

      assert.equal(
        await authorization.allows({
          action: 'patient.update',
          context,
        }),
        false,
      );
    }
  },
);
