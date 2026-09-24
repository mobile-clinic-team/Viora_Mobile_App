import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPostgresDatabase,
} from './runtime.ts';

const connectionString = process.env.DATABASE_URL;

function disposableDatabase() {
  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error(
      'PostgreSQL integration tests require VIORA_DISPOSABLE_DATABASE=1',
    );
  }

  return createPostgresDatabase(connectionString!);
}

test(
  'runtime transaction stays on one PostgreSQL session and commits',
  { skip: !connectionString },
  async () => {
    const database = disposableDatabase();

    try {
      const result = await database.transaction(async (transaction) => {
        const first = await transaction.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );

        const second = await transaction.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );

        return {
          first: first.rows[0].pid,
          second: second.rows[0].pid,
        };
      });

      assert.equal(result.first, result.second);
    } finally {
      await database.close();
    }
  },
);

test(
  'runtime transaction rolls back all writes when work fails',
  { skip: !connectionString },
  async () => {
    const database = disposableDatabase();

    try {
      await database.query(
        'DROP TABLE IF EXISTS runtime_transaction_probe',
      );

      await assert.rejects(
        database.transaction(async (transaction) => {
          await transaction.query(
            'CREATE TABLE runtime_transaction_probe (id integer)',
          );

          await transaction.query(
            'INSERT INTO runtime_transaction_probe (id) VALUES (1)',
          );

          throw new Error('synthetic transaction failure');
        }),
        /synthetic transaction failure/,
      );

      const result = await database.query<{ present: string | null }>(
        `SELECT to_regclass(
          'public.runtime_transaction_probe'
        ) AS present`,
      );

      assert.equal(result.rows[0].present, null);
    } finally {
      await database.query(
        'DROP TABLE IF EXISTS runtime_transaction_probe',
      ).catch(() => {});

      await database.close();
    }
  },
);

test(
  'runtime database rejects queries after close',
  { skip: !connectionString },
  async () => {
    const database = disposableDatabase();

    await database.close();

    await assert.rejects(
      database.query('SELECT 1'),
      /database is closed/,
    );
  },
);