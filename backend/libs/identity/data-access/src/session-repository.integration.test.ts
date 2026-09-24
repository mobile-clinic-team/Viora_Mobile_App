import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createPostgresDatabase,
  createPostgresMigrationDatabase,
  loadMigrationFiles,
  runMigrations,
} from '../../../platform/database/src/index.ts';

import { PostgresSessionRepository } from './session-repository.ts';

const connectionString = process.env.DATABASE_URL;

function requireDisposableDatabase(): string {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.VIORA_DISPOSABLE_DATABASE !== '1') {
    throw new Error(
      'PostgreSQL tests reset public; set VIORA_DISPOSABLE_DATABASE=1 only for a disposable test database',
    );
  }

  return connectionString;
}

test(
  'PostgresSessionRepository creates, rotates, detects replay and revokes sessions',
  { skip: !connectionString },
  async () => {
    const url = requireDisposableDatabase();

    const migrationDatabase =
      createPostgresMigrationDatabase(url);

    try {
      await migrationDatabase.query('DROP SCHEMA public CASCADE');
      await migrationDatabase.query('CREATE SCHEMA public');

      const migrationDirectory = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../database/migrations',
      );

      const migrations =
        await loadMigrationFiles(migrationDirectory);

      await runMigrations(
        migrationDatabase,
        migrations,
      );
    } finally {
      await migrationDatabase.close();
    }

    const database =
      createPostgresDatabase(url);

    try {
      const userId =
        '00000000-0000-0000-0000-000000000201';

      const identityIssuer =
        'https://issuer.example.test';

      const identitySubject =
        'session-user-201';

      const sessionId =
        '00000000-0000-0000-0000-000000000211';

      const familyId =
        '00000000-0000-0000-0000-000000000221';

      const firstTokenId =
        '00000000-0000-0000-0000-000000000231';

      const secondTokenId =
        '00000000-0000-0000-0000-000000000232';

      const thirdTokenId =
        '00000000-0000-0000-0000-000000000233';

      const firstAccessHash = '11'.repeat(32);
      const firstRefreshHash = '22'.repeat(32);
      const secondAccessHash = '33'.repeat(32);
      const secondRefreshHash = '44'.repeat(32);
      const thirdAccessHash = '55'.repeat(32);
      const thirdRefreshHash = '66'.repeat(32);

      const createdAt =
        '2026-09-18T12:00:00.000Z';

      const firstAccessExpiresAt =
        '2026-09-18T12:10:00.000Z';

      const rotatedAt =
        '2026-09-18T12:05:00.000Z';

      const secondAccessExpiresAt =
        '2026-09-18T12:15:00.000Z';

      const replayAt =
        '2026-09-18T12:06:00.000Z';

      const expiresAt =
        '2026-09-18T20:00:00.000Z';

      await database.query(
        `INSERT INTO users
          (id, email, status, created_at, updated_at)
         VALUES
          ($1, 'session-test@example.test', 'ACTIVE',
           $2::timestamptz, $2::timestamptz)`,
        [userId, createdAt],
      );

      await database.query(
        `INSERT INTO identity_subjects
          (issuer, subject, user_id, created_at)
         VALUES
          ($1, $2, $3, $4::timestamptz)`,
        [
          identityIssuer,
          identitySubject,
          userId,
          createdAt,
        ],
      );

      const repository =
        new PostgresSessionRepository(database);

      await repository.create({
        sessionId,
        userId,
        identityIssuer,
        identitySubject,
        accessTokenHash: firstAccessHash,
        accessExpiresAt: firstAccessExpiresAt,
        familyId,
        refreshTokenId: firstTokenId,
        refreshTokenHash: firstRefreshHash,
        createdAt,
        expiresAt,
      });

      const created =
        await database.query<{
          session_status: string;
          family_status: string;
          token_status: string;
          access_hash: string;
          refresh_hash: string;
        }>(
          `SELECT
             s.status AS session_status,
             rf.status AS family_status,
             rt.status AS token_status,
             encode(s.access_token_hash, 'hex') AS access_hash,
             encode(rt.token_hash, 'hex') AS refresh_hash
           FROM sessions s
           JOIN refresh_families rf
             ON rf.session_id = s.id
            AND rf.user_id = s.user_id
           JOIN refresh_tokens rt
             ON rt.family_id = rf.id
          WHERE s.id = $1
            AND rt.id = $2`,
          [sessionId, firstTokenId],
        );

      assert.deepEqual(created.rows[0], {
        session_status: 'ACTIVE',
        family_status: 'ACTIVE',
        token_status: 'ACTIVE',
        access_hash: firstAccessHash,
        refresh_hash: firstRefreshHash,
      });


      const activeBeforeRotation =
        await repository.findActiveAccessSession({
          sessionId,
          presentedAccessTokenHash:
            firstAccessHash,
          now:
            '2026-09-18T12:05:00.000Z',
        });

      assert.deepEqual(
        activeBeforeRotation,
        {
          sessionId,
          userId,
          identityIssuer,
          identitySubject,
          accessExpiresAt:
            firstAccessExpiresAt,
          expiresAt,
        },
      );

      assert.equal(
        await repository.findActiveAccessSession({
          sessionId,
          presentedAccessTokenHash:
            'ff'.repeat(32),
          now:
            '2026-09-18T12:05:00.000Z',
        }),
        null,
      );

      assert.equal(
        await repository.findActiveAccessSession({
          sessionId,
          presentedAccessTokenHash:
            firstAccessHash,
          now: firstAccessExpiresAt,
        }),
        null,
      );

      const rotated =
        await repository.rotateRefreshToken({
          tokenId: firstTokenId,
          presentedTokenHash: firstRefreshHash,
          nextTokenId: secondTokenId,
          nextTokenHash: secondRefreshHash,
          nextAccessTokenHash: secondAccessHash,
          nextAccessExpiresAt: secondAccessExpiresAt,
          rotatedAt,
        });

      assert.deepEqual(rotated, {
        kind: 'ROTATED',
        sessionId,
        userId,
        familyId,
        expiresAt,
      });

      const afterRotation =
        await database.query<{
          id: string;
          status: string;
          token_hash: string;
        }>(
          `SELECT
             id,
             status,
             encode(token_hash, 'hex') AS token_hash
           FROM refresh_tokens
          WHERE family_id = $1
          ORDER BY issued_at ASC, id ASC`,
          [familyId],
        );

      assert.deepEqual(
        afterRotation.rows,
        [
          {
            id: firstTokenId,
            status: 'ROTATED',
            token_hash: firstRefreshHash,
          },
          {
            id: secondTokenId,
            status: 'ACTIVE',
            token_hash: secondRefreshHash,
          },
        ],
      );

      const accessAfterRotation =
        await database.query<{
          access_hash: string;
        }>(
          `SELECT
             encode(access_token_hash, 'hex') AS access_hash
           FROM sessions
          WHERE id = $1`,
          [sessionId],
        );

      assert.equal(
        accessAfterRotation.rows[0].access_hash,
        secondAccessHash,
      );


      assert.equal(
        await repository.findActiveAccessSession({
          sessionId,
          presentedAccessTokenHash:
            firstAccessHash,
          now: replayAt,
        }),
        null,
      );

      const activeAfterRotation =
        await repository.findActiveAccessSession({
          sessionId,
          presentedAccessTokenHash:
            secondAccessHash,
          now: replayAt,
        });

      assert.deepEqual(
        activeAfterRotation,
        {
          sessionId,
          userId,
          identityIssuer,
          identitySubject,
          accessExpiresAt:
            secondAccessExpiresAt,
          expiresAt,
        },
      );

      const replay =
        await repository.rotateRefreshToken({
          tokenId: firstTokenId,
          presentedTokenHash: firstRefreshHash,
          nextTokenId: thirdTokenId,
          nextTokenHash: thirdRefreshHash,
          nextAccessTokenHash: thirdAccessHash,
          nextAccessExpiresAt:
            '2026-09-18T12:16:00.000Z',
          rotatedAt: replayAt,
        });

      assert.deepEqual(replay, {
        kind: 'REPLAY_DETECTED',
        sessionId,
        userId,
        familyId,
      });

      const revokedState =
        await database.query<{
          session_status: string;
          family_status: string;
        }>(
          `SELECT
             s.status AS session_status,
             rf.status AS family_status
           FROM sessions s
           JOIN refresh_families rf
             ON rf.session_id = s.id
            AND rf.user_id = s.user_id
          WHERE s.id = $1`,
          [sessionId],
        );

      assert.deepEqual(revokedState.rows[0], {
        session_status: 'REVOKED',
        family_status: 'REVOKED',
      });


      assert.equal(
        await repository.findActiveAccessSession({
          sessionId,
          presentedAccessTokenHash:
            secondAccessHash,
          now:
            '2026-09-18T12:07:00.000Z',
        }),
        null,
      );

      const revokedTokens =
        await database.query<{
          id: string;
          status: string;
        }>(
          `SELECT id, status
             FROM refresh_tokens
            WHERE family_id = $1
            ORDER BY issued_at ASC, id ASC`,
          [familyId],
        );

      assert.deepEqual(
        revokedTokens.rows,
        [
          {
            id: firstTokenId,
            status: 'REVOKED',
          },
          {
            id: secondTokenId,
            status: 'REVOKED',
          },
        ],
      );

      assert.equal(
        revokedTokens.rows.some(
          ({ id }) => id === thirdTokenId,
        ),
        false,
      );

      const unknown =
        await repository.rotateRefreshToken({
          tokenId:
            '00000000-0000-0000-0000-000000000299',
          presentedTokenHash: '77'.repeat(32),
          nextTokenId:
            '00000000-0000-0000-0000-000000000298',
          nextTokenHash: '88'.repeat(32),
          nextAccessTokenHash: '99'.repeat(32),
          nextAccessExpiresAt:
            '2026-09-18T12:16:00.000Z',
          rotatedAt: replayAt,
        });

      assert.deepEqual(unknown, {
        kind: 'INVALID',
      });

      const secondSessionId =
        '00000000-0000-0000-0000-000000000311';

      const secondFamilyId =
        '00000000-0000-0000-0000-000000000321';

      const secondSessionTokenId =
        '00000000-0000-0000-0000-000000000331';

      await repository.create({
        sessionId: secondSessionId,
        userId,
        identityIssuer,
        identitySubject,
        accessTokenHash: 'aa'.repeat(32),
        accessExpiresAt: firstAccessExpiresAt,
        familyId: secondFamilyId,
        refreshTokenId: secondSessionTokenId,
        refreshTokenHash: 'bb'.repeat(32),
        createdAt,
        expiresAt,
      });

      assert.equal(
        await repository.revokeSession({
          sessionId: secondSessionId,
          userId,
          revokedAt: replayAt,
        }),
        true,
      );

      const explicitRevocation =
        await database.query<{
          session_status: string;
          family_status: string;
          token_status: string;
        }>(
          `SELECT
             s.status AS session_status,
             rf.status AS family_status,
             rt.status AS token_status
           FROM sessions s
           JOIN refresh_families rf
             ON rf.session_id = s.id
            AND rf.user_id = s.user_id
           JOIN refresh_tokens rt
             ON rt.family_id = rf.id
          WHERE s.id = $1
            AND rt.id = $2`,
          [
            secondSessionId,
            secondSessionTokenId,
          ],
        );

      assert.deepEqual(
        explicitRevocation.rows[0],
        {
          session_status: 'REVOKED',
          family_status: 'REVOKED',
          token_status: 'REVOKED',
        },
      );

      assert.equal(
        await repository.revokeSession({
          sessionId:
            '00000000-0000-0000-0000-000000000399',
          userId,
          revokedAt: replayAt,
        }),
        false,
      );
    } finally {
      await database.close();
    }
  },
);