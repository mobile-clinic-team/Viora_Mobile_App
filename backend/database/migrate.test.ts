import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const command = fileURLToPath(new URL('./migrate.ts', import.meta.url));

test('migration command fails closed when DATABASE_URL is missing', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', command], {
    env: { ...process.env, DATABASE_URL: '' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL is required/);
  assert.equal(result.stdout, '');
});

test('migration command never echoes malformed secret-bearing connection configuration', () => {
  const secret = 'migration-secret-must-not-be-logged';
  const result = spawnSync(process.execPath, ['--experimental-strip-types', command], {
    env: { ...process.env, DATABASE_URL: `https://user:${secret}@invalid.example/database` }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid PostgreSQL URL/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
});
