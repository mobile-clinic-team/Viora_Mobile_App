import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleCreatePatient,
  type PatientApiDependencies,
} from './patient-api.ts';
import { createAuthenticatedRequestContext } from '../../../libs/platform/context/src/index.ts';
import {
  PatientMedicalRecordNumberConflictError,
} from '../../../libs/patient/domain/src/repository-ports.ts';
import type {
  IdempotencyRecord,
  IdempotencyStore,
} from '../../../libs/platform/idempotency/src/index.ts';

const context = createAuthenticatedRequestContext({
  requestId: 'request-bd02-mrn',
  correlationId: 'correlation-bd02-mrn',
  userId: 'user-bd02',
  subject: 'subject-bd02',
  tenantId: 'tenant-bd02',
  membershipId: 'membership-bd02',
  permissionRevision: '"1"',
});

test(
  'BD-02 duplicate MRN becomes 409 and records a 409 idempotency failure',
  async () => {
    let record: IdempotencyRecord | undefined;
    let failedResponseCode: number | null | undefined;

    const idempotency: IdempotencyStore = {
      async lookup() {
        return { kind: 'NEW' as const };
      },

      async begin(input) {
        record = {
          ...input,
          status: 'PROCESSING',
          responseCode: null,
          responseReference: null,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
        };

        return {
          kind: 'STARTED' as const,
          record,
        };
      },

      async complete() {
        throw new Error('unexpected idempotency completion');
      },

      async fail(input) {
        assert.ok(record);
        failedResponseCode = input.responseCode ?? null;

        record = {
          ...record,
          status: 'FAILED',
          responseCode: input.responseCode ?? null,
          responseReference: input.responseReference ?? null,
        };

        return record;
      },
    };

    const dependencies: PatientApiDependencies = {
      patients: {
        async findById() {
          return null;
        },

        async findByMedicalRecordNumber() {
          return null;
        },

        async listByTenant() {
          return [];
        },

        async create() {
          throw new PatientMedicalRecordNumberConflictError();
        },

        async update() {
          return null;
        },
      },

      idempotency,

      authorization: {
        allows: () => true,
      },

      present() {
        throw new Error('unexpected presentation');
      },
    };

    const response = await handleCreatePatient(
      dependencies,
      context,
      {
        medicalRecordNumber: 'MRN-DUPLICATE',
        fullName: 'Duplicate MRN Patient',
        dateOfBirth: '1990-01-01',
        sex: 'UNKNOWN',
      },
      'bd02-mrn-conflict-key',
    );

    assert.deepEqual(response, {
      status: 409,
      body: {
        code: 'CONFLICT',
      },
    });

    assert.equal(failedResponseCode, 409);
  },
);