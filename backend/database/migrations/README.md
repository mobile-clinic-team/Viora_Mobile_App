# Database migrations

Migrations in this directory are PostgreSQL SQL files. The implemented runner
is `libs/platform/database/src/index.ts`; it loads files in numeric order,
records SHA-256 checksums in `schema_migrations`, and rejects changed applied
migrations. The current chain is 001–026. Applied SQL files must not be edited.

## Session and transaction ownership

`createPostgresMigrationDatabase` owns one dedicated PostgreSQL client, opened
lazily. `runMigrations` owns one transaction for the entire supplied batch and
holds its advisory transaction lock on that same session. This preserves the
existing batch-atomic behavior: a failure rolls back all new SQL/history from
the batch, leaving previously committed migrations intact. It is not one
transaction per file. Migration SQL must not contain transaction commands.

Use a separate adapter for each migration run, await its operations, and call
`close()` in `finally`, including on connection/migration failure. Closing is
idempotent and ends the session; an unfinished transaction is rolled back by
PostgreSQL. A lost session fails instead of reconnecting within the transaction.
This adapter is not the application connection pool or a shared concurrent
business-transaction coordinator.

## Local/CI validation

`libs/platform/database/src/postgres-migration.integration.test.ts` uses the
real runner and PostgreSQL repositories. The Quality workflow supplies a
disposable `pgvector/pgvector:pg16` service and Node 24.

The integration suite **drops and recreates the public schema**. Provision a
new disposable database/container, verify its exact endpoint, and supply
`DATABASE_URL` and `VIORA_DISPOSABLE_DATABASE=1` to the test process only.
Never point it at a development database holding useful data, staging, or
production. The opt-in flag is an acknowledgement, not automatic proof of
database isolation. Do not store it in a general application environment.

Run `npm test` after providing those test-only variables. Without DATABASE_URL,
database tests are skipped (not validated). With DATABASE_URL but without the
explicit opt-in, they fail before connecting. Fixtures are synthetic.

Coverage includes clean 001–012 execution, an upgrade from 001–005 retaining
existing rows, repeat execution, checksum rejection, rollback after a later
migration fails, session/lock ownership, and closing an unfinished transaction.
Synthetic rollback probes live only in tests and are not release migrations.
The draft test calls the application workflow through the PostgreSQL adapter.

## Deployment and recovery boundary

Run `npm run db:migrate` from `backend/` with `DATABASE_URL` supplied by the
deployment platform's secret environment. This forward-only command uses the
existing runner, lock, transaction, and checksum history. It does not reset
schemas, seed accounts, or require `VIORA_DISPOSABLE_DATABASE`. It verifies all
repository migrations and logs only the count and final version; raw driver
errors and connection strings are not logged. Use it as the deployment's
pre-deploy command before `npm run api:start`. Do not run acceptance test suites
against persistent staging. Confirm the target database and take an appropriate
backup before advancing an existing environment.

Environment promotion and backup/restore automation remain separate release
work. There are no down-migration scripts. A failed uncommitted batch rolls
back; reversing an already committed deployment requires a reviewed forward
fix or tested restoration procedure. Do not claim down-migration or production
recovery validation from the integration suite.

### BD-01 durable authorization state (019)

Migration 019 adds `patient_care_access`, scoped by composite Patient and
membership foreign keys. It retains creation and revocation identity/timestamps,
allows only one active row per workspace/member/Patient/kind, and rejects hard
deletion, truncation, rewriting history, and reactivation of revoked rows.
It introduces no management route, public permission, TTL, or workflow trigger.

The focused test below applies forward migrations without resetting a schema and
rolls back its synthetic fixtures. Supply `DATABASE_URL` for a provisioned
disposable PostgreSQL database and `VIORA_DISPOSABLE_DATABASE=1` only to the test
process, then run from `backend/`:

```powershell
node --experimental-strip-types --test apps/api/src/postgres-care-access.integration.test.ts
```

Without `DATABASE_URL` this test is skipped. The broader existing migration suite
still has the destructive disposable-schema behavior documented above.

Migration `005_audit_events.sql` is intentionally limited to the approved
audit table, tenant/actor referential integrity, keyset-query indexes, and the
append-only database trigger. The application owns resource-reference
semantics, so audit events do not introduce foreign keys to Patient or
Clinical tables.

Migration 013 adds the Phase 4B forward-only foundation: membership grants,
opaque-auth/session storage, durable operation states and resource references,
cross-tenant composite foreign keys, clinical resource/version validators, AI
provenance and handoff evidence, and bounded audit metadata. It does not add
business workflow handlers or choose blocked product decisions.

Before deployment, the database owner must validate clean-database execution,
dependency order, rollback/forward-fix behavior, permissions, and the
PostgreSQL adapter transaction boundary.
