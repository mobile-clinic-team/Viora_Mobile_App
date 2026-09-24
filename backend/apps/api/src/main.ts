import { createDomainReadRuntime } from './domain-read-composition.ts';
import { createPatientSelfAppointments } from './patient-self-appointments.ts';
import { createPatientSelfBooking } from './patient-self-booking.ts';
import { createReadCursorCodec } from './read-cursor.ts';
import { PasswordAuthService } from '../../../libs/identity/application/src/password-auth.ts';
import { PostgresPasswordCredentials } from '../../../libs/identity/data-access/src/password-credentials.ts';
import { createPersonaResolver } from './persona.ts';
import { createPatientCommandRuntime } from './patient-command-runtime.ts';
import { createOperationRuntime } from './operation-runtime.ts';
import { PostgresAuditEventRepository } from '../../../libs/audit/data-access/src/index.ts';
import {
  createPostgresDatabase,
} from '../../../libs/platform/database/src/index.ts';
import {
  PostgresAuthTransactionRepository,
  PostgresIdentityContextStore,
  PostgresMembershipGrantStore,
  PostgresSessionRepository,
} from '../../../libs/identity/data-access/src/index.ts';
import {
  AuthTransactionService,
  ConfiguredOidcProvider,
  createNodeAuthTransactionSecretProtector,
  SessionService,
  StaticOidcProviderRegistry,
} from '../../../libs/identity/application-entrypoint/src/index.ts';
import { createVioraHttpServer } from './http-server.ts';
import { createPatientDirectoryCursorCodec } from './patient-directory-cursor.ts';
import { PostgresPatientRepository } from '../../../libs/patient/data-access/src/index.ts';
import { PostgresIdempotencyStore } from '../../../libs/platform/idempotency/src/index.ts';

function readDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;

  if (
    connectionString === undefined ||
    connectionString.trim() === ''
  ) {
    throw new Error('DATABASE_URL is required');
  }

  return connectionString;
}

function readPort(): number {
  const configuredPort = process.env.PORT;

  if (configuredPort === undefined) {
    return 3000;
  }

  const normalizedPort = configuredPort.trim();

  if (!/^\d+$/.test(normalizedPort)) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const port = Number(normalizedPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function readHost(): string {
  return process.env.HOST?.trim() || '127.0.0.1';
}

function readOptionalEnvironmentValue(
  name: string,
): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password;
  } catch {
    return false;
  }
}

function readConfiguredOidcProvider(): ConfiguredOidcProvider | null {
  const key = readOptionalEnvironmentValue('VIORA_OIDC_PROVIDER');
  const issuer = readOptionalEnvironmentValue('VIORA_OIDC_ISSUER');
  const clientId = readOptionalEnvironmentValue('VIORA_OIDC_CLIENT_ID');
  const authorizationEndpoint = readOptionalEnvironmentValue(
    'VIORA_OIDC_AUTHORIZATION_ENDPOINT',
  );
  const tokenEndpoint = readOptionalEnvironmentValue(
    'VIORA_OIDC_TOKEN_ENDPOINT',
  );
  const redirectUri = readOptionalEnvironmentValue(
    'VIORA_OIDC_REDIRECT_URI',
  );
  const scopesValue = readOptionalEnvironmentValue('VIORA_OIDC_SCOPES');
  const jwksUri = readOptionalEnvironmentValue('VIORA_OIDC_JWKS_URI');

  if (
    key === null ||
    issuer === null ||
    clientId === null ||
    authorizationEndpoint === null ||
    tokenEndpoint === null ||
    redirectUri === null ||
    scopesValue === null ||
    jwksUri === null ||
    !isHttpsUrl(jwksUri) ||
    !isHttpsUrl(issuer) ||
    !isHttpsUrl(authorizationEndpoint) ||
    !isHttpsUrl(tokenEndpoint) ||
    !isHttpsUrl(redirectUri)
  ) {
    return null;
  }

  const scopes = scopesValue.split(/\s+/).filter(Boolean);

  if (
    !/^[A-Za-z0-9._-]{1,128}$/.test(key) ||
    clientId.length > 256 ||
    scopes.length === 0 ||
    !scopes.includes('openid')
  ) {
    return null;
  }

  return new ConfiguredOidcProvider({
    key,
    issuer,
    clientId,
    authorizationEndpoint,
    tokenEndpoint,
    redirectUri,
    scopes,
    jwksUri,
    clientSecret: readOptionalEnvironmentValue('VIORA_OIDC_CLIENT_SECRET') ?? undefined,
  });
}

function readAuthTransactionSecretProtector() {
  const encodedKey = readOptionalEnvironmentValue(
    'VIORA_AUTH_TRANSACTION_ENCRYPTION_KEY',
  ) ?? readOptionalEnvironmentValue('VIORA_OIDC_TRANSACTION_ENCRYPTION_KEY');

  if (encodedKey === null) {
    return null;
  }

  try {
    return createNodeAuthTransactionSecretProtector(encodedKey);
  } catch {
    return null;
  }
}

function listen(
  server: ReturnType<typeof createVioraHttpServer>,
  host: string,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeServer(
  server: ReturnType<typeof createVioraHttpServer>,
): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function start(): Promise<void> {
  const connectionString = readDatabaseUrl();
  const port = readPort();
  const host = readHost();

  const patientDirectoryCursor = createPatientDirectoryCursorCodec(process.env.VIORA_PATIENT_CURSOR_ENCRYPTION_KEY);
  const database = createPostgresDatabase(connectionString);
  const domainReads = createDomainReadRuntime(database, process.env.VIORA_READ_CURSOR_ENCRYPTION_KEY);
  const patients = new PostgresPatientRepository(database);
  const idempotency = new PostgresIdempotencyStore(database);
  const sessionRepository = new PostgresSessionRepository(database);
  const identityStore = new PostgresIdentityContextStore(database);
  const membershipGrantStore =
    new PostgresMembershipGrantStore(database);
  const authTransactionRepository =
    new PostgresAuthTransactionRepository(database);
  const sessionService = new SessionService({
    sessions: sessionRepository,
  });
  const provider = readConfiguredOidcProvider();
  const authTransactionService = new AuthTransactionService({
    transactions: authTransactionRepository,
    providers: new StaticOidcProviderRegistry(provider),
    protector: readAuthTransactionSecretProtector(),
    identities: identityStore,
    sessions: sessionService,
  });
  const server = createVioraHttpServer({
    passwords: new PasswordAuthService(new PostgresPasswordCredentials(database), sessionService),
    resolvePersona: createPersonaResolver(database),
    operations: createOperationRuntime(database, domainReads.careAccess, process.env.VIORA_READ_CURSOR_ENCRYPTION_KEY),
    patientCommands: createPatientCommandRuntime(database, domainReads.careAccess),
    audit: { async append(event) {
      const result = await new PostgresAuditEventRepository(database).append(event);
      if (result.kind === 'CONFLICT') throw new Error('audit conflict');
    } },
    domainReads,
    selfAppointments: createPatientSelfAppointments(database, createReadCursorCodec(process.env.VIORA_READ_CURSOR_ENCRYPTION_KEY),
      new PostgresAuditEventRepository(database)),
    selfBooking: createPatientSelfBooking(database),
    careAccess: domainReads.careAccess,
    patientDirectoryCursor,
    patients,
    idempotency,
    sessions: sessionService,
    identities: identityStore,
    authTransactions: authTransactionService,
    membershipGrants: membershipGrantStore,
  });

  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= (async () => {
      let failed = false;

      try {
        await closeServer(server);
      } catch {
        failed = true;
      }

      try {
        await database.close();
      } catch {
        failed = true;
      }

      if (failed) {
        process.exitCode = 1;
      }
    })();

    return shutdownPromise;
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  try {
    await listen(server, host, port);
  } catch (error) {
    await shutdown();
    throw error;
  }

  console.log(`Viora API listening on http://${host}:${port}`);
}

void start().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Internal server error.',
  );
  process.exitCode = 1;
});
