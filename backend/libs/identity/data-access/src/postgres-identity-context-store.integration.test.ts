import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
} from '../../../platform/database/src/index.ts';

import { PostgresIdentityContextStore } from './index.ts';

const connectionString = process.env.DATABASE_URL;

function disposableDatabase() {
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error(
      'PostgreSQL tests reset public; set VIORA_DISPOSABLE_DATABASE=1 only for a disposable test database',
    );
  }

  return createPostgresMigrationDatabase(connectionString!);
}

test(
  'PostgresIdentityContextStore resolves identity subjects and memberships',
  { skip: !connectionString },
  async () => {
    const database = disposableDatabase();

    try {
      await database.query('DROP SCHEMA public CASCADE');
      await database.query('CREATE SCHEMA public');

      const migrationDirectory = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../database/migrations',
      );

      const migrations = await loadMigrationFiles(migrationDirectory);
      await runMigrations(database, migrations);

      const tenantA = '00000000-0000-0000-0000-000000000101';
      const tenantB = '00000000-0000-0000-0000-000000000102';
      const userId = '00000000-0000-0000-0000-000000000111';
      const membershipA = '00000000-0000-0000-0000-000000000121';
      const membershipB = '00000000-0000-0000-0000-000000000122';

      await database.query(
        `INSERT INTO tenants
          (id, name, status, created_at, updated_at)
         VALUES
          ($1, 'Identity tenant A', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ($2, 'Identity tenant B', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [tenantA, tenantB],
      );

      await database.query(
        `INSERT INTO users
          (id, email, status, created_at, updated_at)
         VALUES
          ($1, 'identity@example.test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId],
      );

      await database.query(
        `INSERT INTO identity_subjects
          (issuer, subject, user_id, created_at)
         VALUES
          ($1, $2, $3, CURRENT_TIMESTAMP)`,
        ['https://issuer.example', 'subject-123', userId],
      );

      await database.query(
        `INSERT INTO memberships
          (id, user_id, tenant_id, role, status, created_at, updated_at)
         VALUES
          ($1, $3, $4, 'DOCTOR', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ($2, $3, $5, 'ADMIN', 'SUSPENDED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [membershipA, membershipB, userId, tenantA, tenantB],
      );

      const store = new PostgresIdentityContextStore(database);

      assert.deepEqual(
        await store.findUserBySubject({
          issuer: 'https://issuer.example',
          subject: 'subject-123',
        }),
        {
          id: userId,
          status: 'ACTIVE',
          subject: {
            issuer: 'https://issuer.example',
            subject: 'subject-123',
          },
        },
      );

      assert.equal(
        await store.findUserBySubject({
          issuer: 'https://issuer.example',
          subject: 'unknown',
        }),
        null,
      );

      assert.deepEqual(await store.findMembershipsByUser(userId), [
        {
          id: membershipA,
          userId,
          tenantId: tenantA,
          role: 'DOCTOR',
          status: 'ACTIVE',
          permissionRevision: '"1"',
        },
        {
          id: membershipB,
          userId,
          tenantId: tenantB,
          role: 'ADMIN',
          status: 'SUSPENDED',
          permissionRevision: '"1"',
        },
      ]);
    } finally {
      await database.close();
    }
  },
);