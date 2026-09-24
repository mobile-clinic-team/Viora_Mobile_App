import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
} from './index.ts';

const connectionString = process.env.DATABASE_URL;

function disposableDatabase() {
  // These tests intentionally reset public. Never use an application database.
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error(
      'PostgreSQL tests reset public; set VIORA_DISPOSABLE_DATABASE=1 only for a disposable test database',
    );
  }
  return createPostgresMigrationDatabase(connectionString!);
}

test(
  'PostgreSQL migration upgrade, replay, checksum rejection and rollback preserve committed state',
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

      const baseline = await runMigrations(
        database,
        migrations.slice(0, 5),
      );

      assert.deepEqual(
        baseline.map(({ version }) => version),
        ['001', '002', '003', '004', '005'],
      );

      const tenantId =
        '00000000-0000-0000-0000-000000000099';

      await database.query(
        "INSERT INTO tenants (id, name, status, created_at, updated_at) VALUES ($1, 'Upgrade fixture', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [tenantId],
      );

      const upgraded = await runMigrations(
        database,
        migrations,
      );

      assert.equal(upgraded.length, 26);

      assert.deepEqual(
        await runMigrations(database, migrations),
        upgraded,
      );

      assert.equal(
        (
          await database.query(
            'SELECT id FROM tenants WHERE id = $1',
            [tenantId],
          )
        ).rows.length,
        1,
      );

      await assert.rejects(
        runMigrations(database, [
          {
            ...migrations[0],
            sql: `${migrations[0].sql}\n-- synthetic checksum mismatch`,
          },
          ...migrations.slice(1),
        ]),
        /checksum mismatch/,
      );

      // A synthetic migration succeeds, then fails; both DDL and history roll back.
      await assert.rejects(
        runMigrations(database, [
          ...migrations,
          {
            version: '027',
            filename: '027_rollback_probe.sql',
            sql: 'CREATE TABLE migration_rollback_probe (id integer);',
          },
          {
            version: '028',
            filename: '028_failure_probe.sql',
            sql: 'SELECT 1 / 0;',
          },
        ]),
        /division by zero/,
      );

      const probe = await database.query<{
        present: string | null;
      }>(
        "SELECT to_regclass('public.migration_rollback_probe') AS present",
      );

      assert.equal(probe.rows[0].present, null);

      assert.equal(
        (
          await database.query(
            'SELECT version FROM schema_migrations',
          )
        ).rows.length,
        26,
      );

      assert.equal(
        (
          await database.query(
            'SELECT id FROM tenants WHERE id = $1',
            [tenantId],
          )
        ).rows.length,
        1,
      );

      assert.deepEqual(
        await runMigrations(database, migrations),
        upgraded,
      );
    } finally {
      await database.close();
    }
  },
);

test(
  'PostgreSQL session stays pinned and close rolls back an unfinished transaction',
  { skip: !connectionString },
  async () => {
    const database = disposableDatabase();
    const observer = disposableDatabase();

    try {
      const first = await database.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );

      await database.query('BEGIN');

      await database.query(
        'CREATE TABLE migration_uncommitted_probe (id integer)',
      );

      await database.query(
        'SELECT pg_advisory_xact_lock(830022)',
      );

      assert.equal(
        (
          await database.query<{ pid: number }>(
            'SELECT pg_backend_pid() AS pid',
          )
        ).rows[0].pid,
        first.rows[0].pid,
      );

      const blocked = await observer.query<{
        acquired: boolean;
      }>(
        'SELECT pg_try_advisory_xact_lock(830022) AS acquired',
      );

      assert.equal(blocked.rows[0].acquired, false);

      await database.close();

      assert.equal(
        (
          await observer.query<{ present: string | null }>(
            "SELECT to_regclass('public.migration_uncommitted_probe') AS present",
          )
        ).rows[0].present,
        null,
      );

      assert.equal(
        (
          await observer.query<{ acquired: boolean }>(
            'SELECT pg_try_advisory_xact_lock(830022) AS acquired',
          )
        ).rows[0].acquired,
        true,
      );

      await assert.rejects(
        database.query('SELECT 1'),
        /closed/,
      );
    } finally {
      await database.close();
      await observer.close();
    }
  },
);
