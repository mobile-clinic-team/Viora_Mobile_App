import { URL } from 'node:url';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

export interface OidcProviderConfiguration {
  readonly mfaAcr?: string;
  readonly key: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly jwksUri?: string;
  readonly clientSecret?: string;
}

export interface OidcAuthorizationUrlInput {
  readonly stepUp?: boolean;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
}

export interface OidcCodeExchangeInput {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

export interface OidcProviderClaims {
  readonly authenticatedAt?: string;
  readonly amr?: readonly string[];
  readonly acr?: string;
  readonly issuer: string;
  readonly subject: string;
  readonly audience: string | readonly string[];
  readonly nonce: string;
  readonly expiresAt?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
}

export interface VerifiedOidcIdentity {
  readonly authenticatedAt?: string;
  readonly amr?: readonly string[];
  readonly acr?: string;
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
}

export interface OidcProvider {
  readonly configuration: OidcProviderConfiguration;

  createAuthorizationUrl(
    input: OidcAuthorizationUrlInput,
  ): string;

  exchangeAuthorizationCode(
    input: OidcCodeExchangeInput,
  ): Promise<OidcProviderClaims>;

  verifyIdentity(
    claims: OidcProviderClaims,
    expectedNonce: string,
    now: Date,
  ): VerifiedOidcIdentity;
}

export interface OidcProviderRegistry {
  hasConfiguredProvider(): boolean;

  resolve(providerKey?: string): OidcProvider | null;
}

export class OidcProviderUnavailableError extends Error {
  public constructor() {
    super('OIDC provider is unavailable');
    this.name = 'OidcProviderUnavailableError';
  }
}

export class OidcVerificationError extends Error {
  public constructor() {
    super('OIDC identity verification failed');
    this.name = 'OidcVerificationError';
  }
}

export class ConfiguredOidcProvider implements OidcProvider {
  public readonly configuration: OidcProviderConfiguration;
  private readonly verifiedClaims = new WeakSet<OidcProviderClaims>();
  private readonly keys: ReturnType<typeof createRemoteJWKSet> | null;
  private readonly fetcher: typeof fetch;

  public constructor(
    configuration: OidcProviderConfiguration,
    fetcher: typeof fetch = fetch,
  ) {
    this.configuration = Object.freeze({ ...configuration, scopes: Object.freeze([...configuration.scopes]) });
    this.fetcher = fetcher;
    for (const value of [configuration.issuer, configuration.authorizationEndpoint,
      configuration.tokenEndpoint, configuration.redirectUri, configuration.jwksUri]) {
      if (value === undefined) continue;
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
        throw new OidcProviderUnavailableError();
      }
    }
    this.keys = configuration.jwksUri === undefined ? null : createRemoteJWKSet(
      new URL(configuration.jwksUri),
      { timeoutDuration: 5000, [customFetch]: fetcher },
    );
  }

  public createAuthorizationUrl(
    input: OidcAuthorizationUrlInput,
  ): string {
    const authorizationUrl = new URL(
      this.configuration.authorizationEndpoint,
    );

    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', this.configuration.clientId);
    authorizationUrl.searchParams.set('redirect_uri', this.configuration.redirectUri);
    authorizationUrl.searchParams.set('scope', this.configuration.scopes.join(' '));
    authorizationUrl.searchParams.set('state', input.state);
    authorizationUrl.searchParams.set('nonce', input.nonce);
    authorizationUrl.searchParams.set('code_challenge', input.codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    if (input.stepUp) {
      if (!this.configuration.mfaAcr) throw new OidcProviderUnavailableError();
      authorizationUrl.searchParams.set('max_age', '0');
      authorizationUrl.searchParams.set('prompt', 'login');
      authorizationUrl.searchParams.set('acr_values', this.configuration.mfaAcr);
    }

    return authorizationUrl.toString();
  }

  public async exchangeAuthorizationCode(
    input: OidcCodeExchangeInput,
  ): Promise<OidcProviderClaims> {
    if (!this.keys) throw new OidcProviderUnavailableError();
    if (input.redirectUri !== this.configuration.redirectUri) throw new OidcVerificationError();
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code: input.code,
      redirect_uri: input.redirectUri, client_id: this.configuration.clientId,
      code_verifier: input.codeVerifier,
    });
    if (this.configuration.clientSecret) body.set('client_secret', this.configuration.clientSecret);
    let response: Response;
    let data: unknown;
    try {
      response = await this.fetcher(this.configuration.tokenEndpoint, {
        method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 500 || response.status === 429) throw new OidcProviderUnavailableError();
        throw new OidcVerificationError();
      }
      // Bound the upstream response as well as the request timeout.
      const reader = response.body?.getReader();
      if (!reader) throw new OidcVerificationError();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65536) { await reader.cancel(); throw new OidcVerificationError(); }
        chunks.push(chunk.value);
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) {
      if (error instanceof OidcVerificationError) throw error;
      throw new OidcProviderUnavailableError();
    }
    try {
      const token = (data as { id_token?: unknown } | null)?.id_token;
      if (typeof token !== 'string') throw new OidcVerificationError();
      const { payload } = await jwtVerify(token, this.keys, {
        algorithms: ['RS256'], issuer: this.configuration.issuer,
        audience: this.configuration.clientId,
        requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce'],
        maxTokenAge: '10m', clockTolerance: 0,
      });
      if (typeof payload.sub !== 'string' || !payload.sub.trim() ||
          typeof payload.nonce !== 'string' || !payload.nonce ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp === undefined) ||
          (payload.azp !== undefined && payload.azp !== this.configuration.clientId)) {
        throw new OidcVerificationError();
      }
      const claims: OidcProviderClaims = Object.freeze({
        issuer: payload.iss!, subject: payload.sub, audience: payload.aud!,
        nonce: payload.nonce, expiresAt: new Date(payload.exp! * 1000).toISOString(),
        ...(Number.isSafeInteger(payload.auth_time) && typeof payload.auth_time === 'number'
          ? { authenticatedAt: new Date(payload.auth_time * 1000).toISOString() } : {}),
        ...(Array.isArray(payload.amr) && payload.amr.every(v => typeof v === 'string') ? { amr: Object.freeze([...payload.amr]) as readonly string[] } : {}),
        ...(typeof payload.acr === 'string' ? { acr: payload.acr } : {}),
      });
      this.verifiedClaims.add(claims);
      return claims;
    } catch {
      throw new OidcVerificationError();
    }
  }

  public verifyIdentity(
    claims: OidcProviderClaims,
    expectedNonce: string,
    now: Date,
  ): VerifiedOidcIdentity {
    const audienceMatches =
      typeof claims.audience === 'string'
        ? claims.audience === this.configuration.clientId
        : claims.audience.includes(this.configuration.clientId);

    if (
      !this.verifiedClaims.has(claims) ||
      claims.issuer !== this.configuration.issuer ||
      !audienceMatches ||
      claims.nonce !== expectedNonce ||
      !claims.subject.trim()
    ) {
      throw new OidcVerificationError();
    }
    this.verifiedClaims.delete(claims);

    if (claims.expiresAt !== undefined) {
      const expiresAt = new Date(claims.expiresAt);
      if (
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt <= now
      ) {
        throw new OidcVerificationError();
      }
    }

    return {
      issuer: claims.issuer,
      subject: claims.subject,
      ...(claims.authenticatedAt === undefined ? {} : { authenticatedAt: claims.authenticatedAt }),
      ...(claims.amr === undefined ? {} : { amr: claims.amr }),
      ...(claims.acr === undefined ? {} : { acr: claims.acr }),
      ...(claims.email === undefined ? {} : { email: claims.email }),
      ...(claims.emailVerified === undefined
        ? {}
        : { emailVerified: claims.emailVerified }),
    };
  }
}

export class StaticOidcProviderRegistry implements OidcProviderRegistry {
  private readonly provider: OidcProvider | null;

  public constructor(provider: OidcProvider | null) {
    this.provider = provider;
  }

  public hasConfiguredProvider(): boolean {
    return this.provider !== null;
  }

  public resolve(providerKey?: string): OidcProvider | null {
    if (
      this.provider === null ||
      (providerKey !== undefined &&
        providerKey !== this.provider.configuration.key)
    ) {
      return null;
    }

    return this.provider;
  }
}
