import { fileURLToPath } from 'node:url';
import {
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
} from '../libs/platform/database/src/index.ts';

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error('DATABASE_URL is required; no migrations were attempted.');
    process.exitCode = 1;
    return;
  }

  // Reject malformed configuration without printing URLs or driver errors.
  try {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error('invalid connection URL');
    }
  } catch {
    console.error('DATABASE_URL must be a valid PostgreSQL URL; no migrations were attempted.');
    process.exitCode = 1;
    return;
  }

  const database = createPostgresMigrationDatabase(connectionString);
  try {
    const directory = fileURLToPath(new URL('./migrations/', import.meta.url));
    const migrations = await loadMigrationFiles(directory);
    if (migrations.length === 0) throw new Error('missing migrations');
    await runMigrations(database, migrations);
    console.info(`Verified ${migrations.length} repository migrations through ${migrations.at(-1)!.version}.`);
  } finally {
    await database.close();
  }
}

try {
  await migrate();
} catch {
  // PostgreSQL errors may contain credentials or row content. Keep release logs safe.
  console.error('Migration failed. Inspect database connectivity, privileges, and migration state using authorized administration tools.');
  process.exitCode = 1;
}
