import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadWorkspacePermissions,
} from './workspace-permissions.ts';

test(
  'workspace permissions load exact tenant membership grants into a set',
  async () => {
    const calls: unknown[] = [];

    const permissions =
      await loadWorkspacePermissions(
        {
          async listPermissions(input) {
            calls.push(input);

            return [
              'patient.read',
              'patient.read',
              'appointment.read',
            ];
          },
        },
        {
          tenantId:
            '00000000-0000-0000-0000-000000000921',
          membershipId:
            '00000000-0000-0000-0000-000000000911',
        },
      );

    assert.deepEqual(calls, [
      {
        tenantId:
          '00000000-0000-0000-0000-000000000921',
        membershipId:
          '00000000-0000-0000-0000-000000000911',
      },
    ]);

    assert.equal(permissions.has('patient.read'), true);
    assert.equal(permissions.has('appointment.read'), true);
    assert.equal(permissions.has('patient.create'), false);
    assert.equal(permissions.size, 2);
  },
);