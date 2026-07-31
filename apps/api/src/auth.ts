import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature
} from "node:crypto";

import {
  type IdentityUser,
  type PostgresAuthRepository,
  type SessionIdentity,
  type SessionSummary
} from "@knotline/db";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export const SESSION_COOKIE = "__Host-knotline-session";
export const INITIATION_COOKIE = "__Host-knotline-auth-init";
export const CSRF_COOKIE = "__Host-knotline-csrf";

const MAGIC_TTL_MS = 15 * 60_000;
const AUTHORIZATION_TTL_MS = 10 * 60_000;
const AUTHORIZATION_RESULT_TTL_MS = 5 * 60_000;
const SESSION_IDLE_MS = 12 * 60 * 60_000;
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60_000;
const RETURN_TARGETS = {
  workflows: "/app/workflows",
  sessions: "/app/profile/sessions",
  profile: "/app/profile"
} as const;

export type ReturnTargetId = keyof typeof RETURN_TARGETS;

export interface AuthRequestContext {
  readonly ip: string;
  readonly userAgent?: string;
  readonly now?: Date;
}

export interface CookieMutation {
  readonly sessionCookie: string;
  readonly csrfCookie: string;
}

export interface MagicLinkDelivery {
  readonly email: string;
  readonly callbackUrl: string;
  readonly expiresAt: string;
}

export interface AuthMailer {
  deliverMagicLink(delivery: MagicLinkDelivery): Promise<{ readonly providerMessageId?: string }>;
}

export interface OidcClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: string | readonly string[];
  readonly nonce: string;
  readonly expiresAt: number;
  readonly issuedAt: number;
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface OidcClient {
  exchange(input: {
    readonly code: string;
    readonly redirectUri: string;
    readonly pkceVerifier: string;
  }): Promise<OidcClaims>;
}

export interface AuthServiceConfig {
  readonly environment: string;
  readonly apiOrigin: string;
  readonly webOrigin: string;
  readonly encryptionKey: string;
  readonly google: {
    readonly issuer: string;
    readonly clientId: string;
    readonly authorizationEndpoint: string;
  };
}

export interface AuthenticatedRequest {
  readonly identity: SessionIdentity;
  readonly csrfToken: string;
}

type AuthRepository = Pick<
  PostgresAuthRepository,
  | "applyEmailDeliveryEvent"
  | "authenticateSession"
  | "consumeAuthorization"
  | "consumeMagicLink"
  | "createAuthorization"
  | "createAuthorizationResult"
  | "createMagicLink"
  | "createSession"
  | "exchangeAuthorizationResult"
  | "findOrCreateUser"
  | "linkGoogleIdentity"
  | "listSessions"
  | "recordEmailDelivery"
  | "revokeOtherSessions"
  | "revokeSession"
  | "rotateSession"
  | "takeRateLimit"
  | "updateProfile"
  | "userById"
  | "workspaces"
>;

export class AuthFailure extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AuthFailure";
  }
}

export function assertRecentAuthentication(
  identity: SessionIdentity,
  maxAgeMs: number,
  now = new Date()
): void {
  if (
    !identity.lastStepUpAt ||
    now.getTime() - new Date(identity.lastStepUpAt).getTime() > maxAgeMs
  ) {
    throw new AuthFailure(
      "RECENT_AUTH_REQUIRED",
      403,
      "Confirm your identity again before continuing."
    );
  }
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const randomSecret = () => randomBytes(32).toString("base64url");
export const secretHash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export function normalizeEmail(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ||
    normalized.includes("\u0000")
  ) {
    throw new AuthFailure("INVALID_EMAIL", 400, "Enter a valid email address.");
  }
  return normalized;
}

export function parseCookies(header: string | undefined): Readonly<Record<string, string>> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) return [];
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    })
  );
}

const cookie = (
  name: string,
  value: string,
  options: { readonly httpOnly: boolean; readonly maxAgeSeconds: number }
) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${options.maxAgeSeconds}; Secure; SameSite=Lax${
    options.httpOnly ? "; HttpOnly" : ""
  }`;

export const clearAuthCookies = () => [
  cookie(SESSION_COOKIE, "", { httpOnly: true, maxAgeSeconds: 0 }),
  cookie(CSRF_COOKIE, "", { httpOnly: false, maxAgeSeconds: 0 })
];

function sameSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

const sessionCredential = (sessionId: string, verifier: string) => `${sessionId}.${verifier}`;
function splitSessionCredential(value: string | undefined): [string, string] | undefined {
  if (!value) return undefined;
  const separator = value.indexOf(".");
  if (separator <= 0 || separator === value.length - 1) return undefined;
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function windowStart(now: Date, durationMs: number): Date {
  return new Date(Math.floor(now.getTime() / durationMs) * durationMs);
}

function deviceSummary(userAgent: string | undefined): string {
  const value = Array.from(userAgent ?? "Unknown browser", (character) =>
    character.charCodeAt(0) < 32 ? " " : character
  )
    .join("")
    .trim();
  return value.slice(0, 180) || "Unknown browser";
}

function encryptionKey(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function encrypt(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [b64url(iv), b64url(cipher.getAuthTag()), b64url(encrypted)].join(".");
}

function decrypt(value: string, key: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(key),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export class CaptureAuthMailer implements AuthMailer {
  private readonly deliveries: MagicLinkDelivery[] = [];

  deliverMagicLink(delivery: MagicLinkDelivery): Promise<{ providerMessageId: string }> {
    this.deliveries.push(delivery);
    return Promise.resolve({ providerMessageId: `local-${this.deliveries.length}` });
  }

  latest(email?: string): MagicLinkDelivery | undefined {
    return [...this.deliveries].reverse().find((item) => !email || item.email === email);
  }

  all(): readonly MagicLinkDelivery[] {
    return [...this.deliveries];
  }
}

export class SesAuthMailer implements AuthMailer {
  private readonly client: SESv2Client;

  constructor(
    region: string,
    private readonly fromAddress: string
  ) {
    this.client = new SESv2Client({ region });
  }

  async deliverMagicLink(delivery: MagicLinkDelivery): Promise<{ providerMessageId?: string }> {
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromAddress,
        Destination: { ToAddresses: [delivery.email] },
        Content: {
          Simple: {
            Subject: { Data: "Sign in to Knotline", Charset: "UTF-8" },
            Body: {
              Text: {
                Data: `Use this one-time link to sign in:\n\n${delivery.callbackUrl}\n\nIt expires at ${delivery.expiresAt}. If you did not request it, ignore this email.`,
                Charset: "UTF-8"
              }
            }
          }
        }
      })
    );
    return result.MessageId ? { providerMessageId: result.MessageId } : {};
  }
}

export class LocalOidcClient implements OidcClient {
  constructor(
    private readonly issuer: string,
    private readonly clientId: string
  ) {}

  exchange(input: { readonly code: string }): Promise<OidcClaims> {
    let payload: { nonce?: string; email?: string; subject?: string; expiresAt?: number };
    try {
      payload = JSON.parse(Buffer.from(input.code, "base64url").toString("utf8")) as typeof payload;
    } catch {
      throw new AuthFailure("OIDC_CODE_INVALID", 400, "The identity response was not valid.");
    }
    if (!payload.nonce || !payload.email || !payload.subject) {
      throw new AuthFailure("OIDC_CODE_INVALID", 400, "The identity response was not valid.");
    }
    const now = Math.floor(Date.now() / 1000);
    return Promise.resolve({
      issuer: this.issuer,
      subject: payload.subject,
      audience: this.clientId,
      nonce: payload.nonce,
      expiresAt: payload.expiresAt ?? now + 300,
      issuedAt: now,
      email: normalizeEmail(payload.email),
      emailVerified: true
    });
  }
}

interface JsonWebKey extends Record<string, string | undefined> {
  readonly kty: string;
  readonly kid?: string;
  readonly n?: string;
  readonly e?: string;
  readonly alg?: string;
  readonly use?: string;
}

export class RemoteGoogleOidcClient implements OidcClient {
  private keys: { readonly expiresAt: number; readonly values: readonly JsonWebKey[] } | undefined;

  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly tokenEndpoint: string,
    private readonly jwksUri: string,
    private readonly clientSecret?: string
  ) {}

  private async jwks(): Promise<readonly JsonWebKey[]> {
    if (this.keys && this.keys.expiresAt > Date.now()) return this.keys.values;
    const response = await fetch(this.jwksUri, { headers: { accept: "application/json" } });
    if (!response.ok)
      throw new AuthFailure("OIDC_KEYS_UNAVAILABLE", 503, "Sign-in is temporarily unavailable.");
    const body = (await response.json()) as { keys?: readonly JsonWebKey[] };
    if (!body.keys?.length)
      throw new AuthFailure("OIDC_KEYS_INVALID", 503, "Sign-in is temporarily unavailable.");
    const maxAge = /max-age=(\d+)/u.exec(response.headers.get("cache-control") ?? "")?.[1];
    this.keys = {
      values: body.keys,
      expiresAt: Date.now() + Math.min(Number(maxAge ?? 300), 3600) * 1000
    };
    return body.keys;
  }

  async exchange(input: {
    readonly code: string;
    readonly redirectUri: string;
    readonly pkceVerifier: string;
  }): Promise<OidcClaims> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: this.clientId,
      redirect_uri: input.redirectUri,
      code_verifier: input.pkceVerifier
    });
    if (this.clientSecret) body.set("client_secret", this.clientSecret);
    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body
    });
    if (!response.ok)
      throw new AuthFailure(
        "OIDC_EXCHANGE_FAILED",
        400,
        "The identity response could not be exchanged."
      );
    const token = (await response.json()) as { id_token?: string };
    if (!token.id_token)
      throw new AuthFailure("OIDC_TOKEN_MISSING", 400, "The identity response was incomplete.");
    const parts = token.id_token.split(".");
    if (parts.length !== 3)
      throw new AuthFailure("OIDC_TOKEN_INVALID", 400, "The identity response was not valid.");
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      iss?: string;
      sub?: string;
      aud?: string | readonly string[];
      nonce?: string;
      exp?: number;
      iat?: number;
      email?: string;
      email_verified?: boolean;
    };
    if (header.alg !== "RS256" || !header.kid)
      throw new AuthFailure("OIDC_ALGORITHM_INVALID", 400, "The identity signature was not valid.");
    const key = (await this.jwks()).find(
      (candidate) => candidate.kid === header.kid && candidate.kty === "RSA"
    );
    if (
      !key ||
      !verifySignature(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        createPublicKey({ key, format: "jwk" }),
        Buffer.from(encodedSignature, "base64url")
      )
    ) {
      throw new AuthFailure("OIDC_SIGNATURE_INVALID", 400, "The identity signature was not valid.");
    }
    if (
      !payload.iss ||
      !payload.sub ||
      !payload.aud ||
      !payload.nonce ||
      !payload.exp ||
      !payload.iat ||
      !payload.email
    ) {
      throw new AuthFailure("OIDC_CLAIMS_INVALID", 400, "The identity response was incomplete.");
    }
    return {
      issuer: payload.iss,
      subject: payload.sub,
      audience: payload.aud,
      nonce: payload.nonce,
      expiresAt: payload.exp,
      issuedAt: payload.iat,
      email: normalizeEmail(payload.email),
      emailVerified: payload.email_verified === true
    };
  }
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly mailer: AuthMailer,
    private readonly oidc: OidcClient,
    readonly config: AuthServiceConfig
  ) {}

  returnPath(id: string): string {
    return RETURN_TARGETS[id as ReturnTargetId] ?? RETURN_TARGETS.workflows;
  }

  private contextNow(context: AuthRequestContext): Date {
    return context.now ?? new Date();
  }

  private async issueSession(
    userId: string,
    context: AuthRequestContext,
    stepUp = false
  ): Promise<CookieMutation> {
    const user = await this.repository.userById(userId);
    if (!user || user.status !== "active") {
      throw new AuthFailure("ACCOUNT_SUSPENDED", 403, "This account cannot sign in.");
    }
    const now = this.contextNow(context);
    const verifier = randomSecret();
    const session = await this.repository.createSession({
      userId,
      verifierHash: secretHash(verifier),
      ipHash: secretHash(context.ip),
      deviceSummary: deviceSummary(context.userAgent),
      now,
      idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      stepUp
    });
    const csrf = randomSecret();
    return {
      sessionCookie: cookie(SESSION_COOKIE, sessionCredential(session.sessionId, verifier), {
        httpOnly: true,
        maxAgeSeconds: SESSION_ABSOLUTE_MS / 1000
      }),
      csrfCookie: cookie(CSRF_COOKIE, csrf, {
        httpOnly: false,
        maxAgeSeconds: SESSION_ABSOLUTE_MS / 1000
      })
    };
  }

  async requestMagicLink(input: {
    readonly email: string;
    readonly intent: "login" | "step_up";
    readonly returnTargetId: string;
    readonly context: AuthRequestContext;
  }): Promise<void> {
    const email = normalizeEmail(input.email);
    const target = this.returnPath(input.returnTargetId);
    const now = this.contextNow(input.context);
    const emailHash = secretHash(email);
    const allowedByIp = await this.repository.takeRateLimit({
      scope: "magic-ip",
      subjectHash: secretHash(input.context.ip),
      windowStartedAt: windowStart(now, 60 * 60_000),
      limit: 20
    });
    const allowedByIdentity = await this.repository.takeRateLimit({
      scope: "magic-identity",
      subjectHash: emailHash,
      windowStartedAt: windowStart(now, 60 * 60_000),
      limit: 5
    });
    if (!allowedByIp || !allowedByIdentity) return;
    const user = await this.repository.findOrCreateUser(email);
    const token = randomSecret();
    const expiresAt = new Date(now.getTime() + MAGIC_TTL_MS);
    await this.repository.createMagicLink({
      userId: user.id,
      normalizedEmailHash: emailHash,
      tokenVerifierHash: secretHash(token),
      requestedIpHash: secretHash(input.context.ip),
      intent: input.intent,
      returnTargetId: Object.hasOwn(RETURN_TARGETS, input.returnTargetId)
        ? input.returnTargetId
        : "workflows",
      expiresAt
    });
    const result = await this.mailer.deliverMagicLink({
      email,
      callbackUrl: `${this.config.webOrigin}/auth/magic/callback#token=${encodeURIComponent(token)}&intent=${input.intent}&return=${encodeURIComponent(target)}`,
      expiresAt: expiresAt.toISOString()
    });
    await this.repository.recordEmailDelivery({
      userId: user.id,
      normalizedEmailHash: emailHash,
      state:
        this.config.environment === "local" || this.config.environment === "ci"
          ? "captured"
          : "sent",
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {})
    });
  }

  async exchangeMagicLink(input: {
    readonly token: string;
    readonly intent: "login" | "step_up";
    readonly context: AuthRequestContext;
  }): Promise<{ readonly cookies: CookieMutation; readonly returnTarget: string }> {
    if (input.token.length < 32 || input.token.length > 256) {
      throw new AuthFailure("MAGIC_LINK_INVALID", 400, "This sign-in link is not valid.");
    }
    const consumed = await this.repository.consumeMagicLink(
      secretHash(input.token),
      input.intent,
      this.contextNow(input.context)
    );
    if (consumed.status !== "ok" || !consumed.record) {
      const code =
        consumed.status === "expired"
          ? "MAGIC_LINK_EXPIRED"
          : consumed.status === "used"
            ? "MAGIC_LINK_USED"
            : "MAGIC_LINK_INVALID";
      throw new AuthFailure(
        code,
        400,
        code === "MAGIC_LINK_EXPIRED"
          ? "This sign-in link has expired."
          : code === "MAGIC_LINK_USED"
            ? "This sign-in link was already used."
            : "This sign-in link is not valid."
      );
    }
    return {
      cookies: await this.issueSession(
        consumed.record.userId,
        input.context,
        consumed.record.intent === "step_up"
      ),
      returnTarget: this.returnPath(consumed.record.returnTargetId)
    };
  }

  async startGoogle(input: {
    readonly returnTargetId: string;
    readonly browserBinding?: string;
    readonly context: AuthRequestContext;
  }): Promise<{
    readonly authorizationUrl: string;
    readonly expiresAt: string;
    readonly initiationCookie: string;
  }> {
    const now = this.contextNow(input.context);
    const state = randomSecret();
    const nonce = randomSecret();
    const pkceVerifier = randomSecret();
    const browserBinding = input.browserBinding ?? randomSecret();
    const callbackUri = `${this.config.apiOrigin}/callbacks/v1/identity/oauth/google`;
    const returnTargetId = Object.hasOwn(RETURN_TARGETS, input.returnTargetId)
      ? input.returnTargetId
      : "workflows";
    const expiresAt = new Date(now.getTime() + AUTHORIZATION_TTL_MS);
    await this.repository.createAuthorization({
      provider: "google",
      applicationId: this.config.google.clientId,
      environment: this.config.environment,
      authorizationLocatorHash: secretHash(state),
      stateHash: secretHash(state),
      nonceHash: secretHash(nonce),
      pkceVerifierHash: secretHash(pkceVerifier),
      pkceVerifierCiphertext: encrypt(pkceVerifier, this.config.encryptionKey),
      browserBindingHash: secretHash(browserBinding),
      callbackUri,
      returnTargetId,
      requestedScopes: ["openid", "email", "profile"],
      expiresAt
    });
    const url = new URL(this.config.google.authorizationEndpoint);
    for (const [name, value] of Object.entries({
      client_id: this.config.google.clientId,
      redirect_uri: callbackUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: b64url(createHash("sha256").update(pkceVerifier).digest()),
      code_challenge_method: "S256",
      prompt: "select_account"
    }))
      url.searchParams.set(name, value);
    return {
      authorizationUrl: url.toString(),
      expiresAt: expiresAt.toISOString(),
      initiationCookie: cookie(INITIATION_COOKIE, browserBinding, {
        httpOnly: true,
        maxAgeSeconds: AUTHORIZATION_TTL_MS / 1000
      })
    };
  }

  async completeGoogleCallback(input: {
    readonly state: string;
    readonly code?: string;
    readonly providerError?: string;
    readonly now?: Date;
  }): Promise<string> {
    const now = input.now ?? new Date();
    if (input.state.length < 32 || input.state.length > 256) {
      throw new AuthFailure("OIDC_STATE_INVALID", 400, "The sign-in response was not valid.");
    }
    const consumed = await this.repository.consumeAuthorization(secretHash(input.state), now);
    if (consumed.status !== "ok" || !consumed.transaction) {
      throw new AuthFailure(
        consumed.status === "expired"
          ? "OIDC_TRANSACTION_EXPIRED"
          : consumed.status === "used"
            ? "OIDC_TRANSACTION_USED"
            : "OIDC_STATE_INVALID",
        400,
        "The sign-in transaction is invalid or has expired."
      );
    }
    const transaction = consumed.transaction;
    if (
      transaction.provider !== "google" ||
      transaction.applicationId !== this.config.google.clientId ||
      transaction.environment !== this.config.environment ||
      transaction.callbackUri !== `${this.config.apiOrigin}/callbacks/v1/identity/oauth/google`
    )
      throw new AuthFailure(
        "OIDC_MIX_UP",
        400,
        "The identity provider response did not match the request."
      );
    const handle = randomSecret();
    let userId: string | undefined;
    let resultCode: "success" | "provider_denied" | "account_suspended" = "provider_denied";
    if (!input.providerError) {
      if (!input.code)
        throw new AuthFailure("OIDC_CODE_MISSING", 400, "The identity response was incomplete.");
      const claims = await this.oidc.exchange({
        code: input.code,
        redirectUri: transaction.callbackUri,
        pkceVerifier: decrypt(transaction.pkceVerifierCiphertext, this.config.encryptionKey)
      });
      const audiences = Array.isArray(claims.audience) ? claims.audience : [claims.audience];
      if (
        claims.issuer !== this.config.google.issuer ||
        !audiences.includes(this.config.google.clientId) ||
        secretHash(claims.nonce) !== transaction.nonceHash ||
        claims.expiresAt <= Math.floor(now.getTime() / 1000) ||
        claims.issuedAt > Math.floor(now.getTime() / 1000) + 60 ||
        !claims.subject ||
        !claims.emailVerified
      )
        throw new AuthFailure(
          "OIDC_CLAIMS_INVALID",
          400,
          "The identity response did not pass validation."
        );
      const user = await this.repository.linkGoogleIdentity({
        issuer: claims.issuer,
        subject: claims.subject,
        email: claims.email,
        emailVerified: claims.emailVerified
      });
      userId = user.id;
      resultCode = user.status === "active" ? "success" : "account_suspended";
    }
    await this.repository.createAuthorizationResult({
      transactionId: transaction.id,
      resultHandleHash: secretHash(handle),
      browserBindingHash: transaction.browserBindingHash,
      ...(userId ? { userId } : {}),
      returnTargetId: transaction.returnTargetId,
      resultCode,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_RESULT_TTL_MS)
    });
    return `${this.config.webOrigin}/auth/google/callback#result=${encodeURIComponent(handle)}`;
  }

  async exchangeGoogleResult(input: {
    readonly resultHandle: string;
    readonly browserBinding: string | undefined;
    readonly context: AuthRequestContext;
  }): Promise<{ readonly cookies: CookieMutation; readonly returnTarget: string }> {
    if (
      !input.browserBinding ||
      input.resultHandle.length < 32 ||
      input.resultHandle.length > 256
    ) {
      throw new AuthFailure(
        "OIDC_RESULT_INVALID",
        400,
        "The sign-in result is not valid in this browser."
      );
    }
    const exchanged = await this.repository.exchangeAuthorizationResult({
      resultHandleHash: secretHash(input.resultHandle),
      browserBindingHash: secretHash(input.browserBinding),
      now: this.contextNow(input.context)
    });
    if (exchanged.status !== "ok" || exchanged.resultCode !== "success" || !exchanged.userId) {
      const code =
        exchanged.status === "wrong_browser"
          ? "OIDC_BROWSER_MISMATCH"
          : exchanged.resultCode === "account_suspended"
            ? "ACCOUNT_SUSPENDED"
            : exchanged.resultCode === "provider_denied"
              ? "OIDC_PROVIDER_DENIED"
              : "OIDC_RESULT_INVALID";
      throw new AuthFailure(
        code,
        code === "ACCOUNT_SUSPENDED" ? 403 : 400,
        "The sign-in result could not be exchanged."
      );
    }
    return {
      cookies: await this.issueSession(exchanged.userId, input.context),
      returnTarget: this.returnPath(exchanged.returnTargetId ?? "workflows")
    };
  }

  async authenticate(
    cookieHeader: string | undefined,
    now = new Date()
  ): Promise<AuthenticatedRequest> {
    const cookies = parseCookies(cookieHeader);
    const credential = splitSessionCredential(cookies[SESSION_COOKIE]);
    if (!credential) throw new AuthFailure("SESSION_REQUIRED", 401, "Sign in to continue.");
    const [sessionId, verifier] = credential;
    const authenticated = await this.repository.authenticateSession(
      sessionId,
      secretHash(verifier),
      now
    );
    if (authenticated.status !== "ok" || !authenticated.identity) {
      throw new AuthFailure(
        authenticated.status === "suspended"
          ? "ACCOUNT_SUSPENDED"
          : authenticated.status === "reused"
            ? "SESSION_REUSE_DETECTED"
            : authenticated.status === "expired"
              ? "SESSION_EXPIRED"
              : "SESSION_INVALID",
        authenticated.status === "suspended" ? 403 : 401,
        "The session is no longer valid."
      );
    }
    return { identity: authenticated.identity, csrfToken: cookies[CSRF_COOKIE] ?? "" };
  }

  verifyMutation(input: {
    readonly authenticated: AuthenticatedRequest;
    readonly csrfHeader: string | undefined;
    readonly origin: string | undefined;
  }): void {
    if (input.origin !== this.config.webOrigin) {
      throw new AuthFailure("ORIGIN_REJECTED", 403, "The request origin is not allowed.");
    }
    if (
      !input.csrfHeader ||
      !input.authenticated.csrfToken ||
      !sameSecret(input.csrfHeader, input.authenticated.csrfToken)
    ) {
      throw new AuthFailure("CSRF_REJECTED", 403, "The request verification token is invalid.");
    }
  }

  async refresh(input: {
    readonly cookieHeader: string | undefined;
    readonly csrfHeader: string | undefined;
    readonly origin: string | undefined;
    readonly context: AuthRequestContext;
  }): Promise<{ readonly cookies: CookieMutation; readonly identity: SessionIdentity }> {
    const cookies = parseCookies(input.cookieHeader);
    const credential = splitSessionCredential(cookies[SESSION_COOKIE]);
    if (!credential) throw new AuthFailure("SESSION_REQUIRED", 401, "Sign in to continue.");
    if (
      input.origin !== this.config.webOrigin ||
      !input.csrfHeader ||
      !cookies[CSRF_COOKIE] ||
      !sameSecret(input.csrfHeader, cookies[CSRF_COOKIE])
    ) {
      throw new AuthFailure("CSRF_REJECTED", 403, "The request verification token is invalid.");
    }
    const [sessionId, oldVerifier] = credential;
    const newVerifier = randomSecret();
    const now = this.contextNow(input.context);
    const rotated = await this.repository.rotateSession({
      sessionId,
      oldVerifierHash: secretHash(oldVerifier),
      newVerifierHash: secretHash(newVerifier),
      now,
      idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_MS)
    });
    if (rotated.status !== "ok" || !rotated.identity) {
      throw new AuthFailure(
        rotated.status === "reused" ? "SESSION_REUSE_DETECTED" : "SESSION_INVALID",
        401,
        "The session is no longer valid."
      );
    }
    const csrf = randomSecret();
    return {
      identity: rotated.identity,
      cookies: {
        sessionCookie: cookie(SESSION_COOKIE, sessionCredential(sessionId, newVerifier), {
          httpOnly: true,
          maxAgeSeconds: SESSION_ABSOLUTE_MS / 1000
        }),
        csrfCookie: cookie(CSRF_COOKIE, csrf, {
          httpOnly: false,
          maxAgeSeconds: SESSION_ABSOLUTE_MS / 1000
        })
      }
    };
  }

  async sessions(identity: SessionIdentity): Promise<readonly SessionSummary[]> {
    return this.repository.listSessions(identity.user.id, identity.sessionId);
  }

  async bootstrap(identity: SessionIdentity): Promise<{
    readonly user: IdentityUser;
    readonly workspaces: readonly {
      readonly id: string;
      readonly name: string;
      readonly slug: string;
      readonly role: string;
    }[];
    readonly activeWorkspaceId?: string;
    readonly serverTime: string;
  }> {
    const workspaces = await this.repository.workspaces(identity.user.id);
    return {
      user: identity.user,
      workspaces,
      ...(identity.activeWorkspaceId ? { activeWorkspaceId: identity.activeWorkspaceId } : {}),
      serverTime: new Date().toISOString()
    };
  }

  async revoke(identity: SessionIdentity, sessionId: string, now = new Date()): Promise<boolean> {
    return this.repository.revokeSession(identity.user.id, sessionId, "user_revoked", now);
  }

  async revokeOthers(identity: SessionIdentity, now = new Date()): Promise<number> {
    return this.repository.revokeOtherSessions(identity.user.id, identity.sessionId, now);
  }

  async logout(identity: SessionIdentity, now = new Date()): Promise<void> {
    await this.repository.revokeSession(identity.user.id, identity.sessionId, "logout", now);
  }

  async updateProfile(
    identity: SessionIdentity,
    input: { readonly displayName?: string; readonly locale?: string; readonly timezone?: string }
  ): Promise<IdentityUser> {
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(new Date());
      } catch {
        throw new AuthFailure("TIMEZONE_INVALID", 400, "Choose a valid timezone.");
      }
    }
    return this.repository.updateProfile(identity.user.id, input);
  }

  async recordEmailDeliveryEvent(
    providerMessageId: string,
    state: "delivered" | "bounced" | "complained" | "failed"
  ): Promise<boolean> {
    return this.repository.applyEmailDeliveryEvent(providerMessageId, state);
  }
}
