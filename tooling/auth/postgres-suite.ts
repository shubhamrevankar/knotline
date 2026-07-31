import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { buildApp } from "../../apps/api/src/app.js";
import { AuthService, CaptureAuthMailer, LocalOidcClient } from "../../apps/api/src/auth.js";
import {
  createPool,
  migrate,
  PostgresAuthRepository,
  PostgresWorkflowRepository,
  seedSyntheticTenants
} from "../../packages/db/src/index.js";

const IMAGE =
  "pgvector/pgvector:0.8.1-pg17-trixie@sha256:137f044b0efe3d57f39b972b9b53641b1f2045b99d879e298bbf514a25787dcf";
const containerName = `knotline-m04-auth-${process.pid}-${Date.now()}`;
const password = "local-only-m04-auth-password";
const webOrigin = "http://localhost:5173";
const apiOrigin = "http://localhost:4100";
type DatabasePool = ReturnType<typeof createPool>;

function docker(...args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function startPostgres(): Promise<{ adminUrl: string; pool: DatabasePool }> {
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_DB=knotline",
    "--env",
    "POSTGRES_USER=knotline_local",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    IMAGE
  );
  let port = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    port = docker("port", containerName, "5432/tcp").match(/:(\d+)$/u)?.[1] ?? "";
    if (port) break;
    await delay(100);
  }
  assert(port, "PostgreSQL did not publish a local port");
  const adminUrl = `postgresql://knotline_local:${password}@127.0.0.1:${port}/knotline`;
  const pool = createPool(adminUrl, { max: 20 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return { adminUrl, pool };
    } catch {
      await delay(250);
    }
  }
  throw new Error("PostgreSQL did not become ready");
}

function authService(pool: DatabasePool, mailer = new CaptureAuthMailer()) {
  const repository = new PostgresAuthRepository(pool);
  const auth = new AuthService(
    repository,
    mailer,
    new LocalOidcClient(`${apiOrigin}/__local/oidc`, "knotline-local-client"),
    {
      environment: "ci",
      apiOrigin,
      webOrigin,
      encryptionKey: "local-only-m04-suite-encryption-key",
      google: {
        issuer: `${apiOrigin}/__local/oidc`,
        clientId: "knotline-local-client",
        authorizationEndpoint: `${apiOrigin}/__local/oidc/authorize`
      }
    }
  );
  return { auth, mailer, repository };
}

function fragmentValue(url: string, name: string): string {
  const value = new URLSearchParams(new URL(url).hash.slice(1)).get(name);
  assert(value, `Missing ${name} fragment value`);
  return value;
}

function cookieHeader(setCookie: string | readonly string[] | undefined): {
  readonly header: string;
  readonly csrf: string;
  readonly session: string;
} {
  const values: readonly string[] = typeof setCookie === "string" ? [setCookie] : (setCookie ?? []);
  const pairs = values.map((value) => value.split(";")[0]).filter(Boolean) as string[];
  const csrf = pairs.find((value) => value.startsWith("__Host-knotline-csrf="))?.split("=")[1];
  const session = pairs.find((value) => value.startsWith("__Host-knotline-session="));
  assert(csrf && session, "Session response omitted secure session or CSRF cookie");
  return { header: pairs.join("; "), csrf: decodeURIComponent(csrf), session };
}

async function requestAndCaptureMagic(
  auth: AuthService,
  mailer: CaptureAuthMailer,
  email = "maya@northstar.example",
  now = new Date()
): Promise<string> {
  await auth.requestMagicLink({
    email,
    intent: "login",
    returnTargetId: "workflows",
    context: { ip: "127.0.0.1", userAgent: "M04 suite", now }
  });
  const delivery = mailer.latest(email);
  assert(delivery, "Magic-link delivery was not captured");
  return fragmentValue(delivery.callbackUrl, "token");
}

async function runSuite(pool: DatabasePool): Promise<Record<string, unknown>> {
  const { auth, mailer, repository } = authService(pool);
  const fixed = new Date();
  const token = await requestAndCaptureMagic(auth, mailer, "maya@northstar.example", fixed);
  const wrongIntent = await Promise.allSettled([
    auth.exchangeMagicLink({
      token,
      intent: "step_up",
      context: { ip: "127.0.0.1", now: fixed }
    })
  ]);
  assert(wrongIntent[0]?.status === "rejected", "Magic link accepted the wrong intent");
  const exchanged = await auth.exchangeMagicLink({
    token,
    intent: "login",
    context: { ip: "127.0.0.1", userAgent: "M04 suite", now: fixed }
  });
  assert(exchanged.returnTarget === "/app/workflows", "Magic link lost its return-target binding");
  assert(
    exchanged.cookies.sessionCookie.includes("HttpOnly"),
    "Session cookie is browser-readable"
  );
  for (const attribute of ["Secure", "SameSite=Lax", "Path=/"]) {
    assert(
      exchanged.cookies.sessionCookie.includes(attribute),
      `Session cookie omitted ${attribute}`
    );
  }
  const replay = await Promise.allSettled([
    auth.exchangeMagicLink({ token, intent: "login", context: { ip: "127.0.0.1", now: fixed } })
  ]);
  assert(replay[0]?.status === "rejected", "Magic link replay created another session");

  const expiryToken = await requestAndCaptureMagic(auth, mailer, "elias@harbor.example", fixed);
  const expired = await Promise.allSettled([
    auth.exchangeMagicLink({
      token: expiryToken,
      intent: "login",
      context: { ip: "127.0.0.2", now: new Date(fixed.getTime() + 16 * 60_000) }
    })
  ]);
  assert(expired[0]?.status === "rejected", "Expired magic link created a session");

  const raceToken = await requestAndCaptureMagic(
    auth,
    mailer,
    "maya@northstar.example",
    new Date(fixed.getTime() + 60_000)
  );
  const race = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      auth.exchangeMagicLink({
        token: raceToken,
        intent: "login",
        context: { ip: "127.0.0.1", now: new Date(fixed.getTime() + 60_000) }
      })
    )
  );
  assert(
    race.filter(({ status }) => status === "fulfilled").length === 1,
    "Magic link race did not select one winner"
  );

  const beforeRateLimit = mailer.all().length;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    await auth.requestMagicLink({
      email: "rate-limit@example.test",
      intent: "login",
      returnTargetId: "workflows",
      context: { ip: "127.0.0.33", now: new Date(fixed.getTime() + 2 * 60 * 60_000) }
    });
  }
  assert(mailer.all().length - beforeRateLimit === 5, "Identity rate limit did not cap delivery");

  const validateNegativeOidc = async (
    label: string,
    mutate: (claims: {
      issuer: string;
      subject: string;
      audience: string;
      nonce: string;
      expiresAt: number;
      issuedAt: number;
      email: string;
      emailVerified: boolean;
    }) => void
  ) => {
    let expectedNonce = "";
    const negativeAuth = new AuthService(
      repository,
      mailer,
      {
        exchange: () => {
          const nowSeconds = Math.floor(Date.now() / 1000);
          const claims = {
            issuer: `${apiOrigin}/__local/oidc`,
            subject: `negative-${label}`,
            audience: "knotline-local-client",
            nonce: expectedNonce,
            expiresAt: nowSeconds + 300,
            issuedAt: nowSeconds,
            email: "maya@northstar.example",
            emailVerified: true
          };
          mutate(claims);
          return Promise.resolve(claims);
        }
      },
      auth.config
    );
    const started = await negativeAuth.startGoogle({
      returnTargetId: "workflows",
      context: { ip: "127.0.0.44" }
    });
    const authorization = new URL(started.authorizationUrl);
    const state = authorization.searchParams.get("state");
    expectedNonce = authorization.searchParams.get("nonce") ?? "";
    assert(state && expectedNonce, `Negative ${label} fixture omitted state or nonce`);
    const result = await Promise.allSettled([
      negativeAuth.completeGoogleCallback({ state, code: `negative-${label}` })
    ]);
    assert(result[0]?.status === "rejected", `OIDC ${label} negative case was accepted`);
  };
  await validateNegativeOidc("issuer", (claims) => {
    claims.issuer = "https://issuer-mixup.invalid";
  });
  await validateNegativeOidc("audience", (claims) => {
    claims.audience = "different-application";
  });
  await validateNegativeOidc("nonce", (claims) => {
    claims.nonce = "attacker-nonce";
  });
  await validateNegativeOidc("expiry", (claims) => {
    claims.expiresAt = Math.floor(Date.now() / 1000) - 1;
  });
  await validateNegativeOidc("unverified-email", (claims) => {
    claims.emailVerified = false;
  });

  const workflowRepository = new PostgresWorkflowRepository(pool);
  const app = await buildApp({
    environment: "ci",
    logLevel: false,
    webOrigin,
    repository: workflowRepository,
    auth,
    captureMailer: mailer
  });
  try {
    const httpToken = await requestAndCaptureMagic(
      auth,
      mailer,
      "maya@northstar.example",
      new Date(fixed.getTime() + 3 * 60 * 60_000)
    );
    const httpExchange = await app.inject({
      method: "POST",
      url: "/edge/v1/auth/magic-links/exchange",
      payload: { token: httpToken, intent: "login" },
      headers: { "user-agent": "Chromium M04" }
    });
    assert(httpExchange.statusCode === 200, "HTTP magic-link exchange failed");
    const initialCookie = cookieHeader(httpExchange.headers["set-cookie"]);
    const bootstrap = await app.inject({
      method: "GET",
      url: "/v1/me/bootstrap",
      headers: { cookie: initialCookie.header }
    });
    assert(bootstrap.statusCode === 200, "Authenticated bootstrap rejected a valid session");
    assert(
      bootstrap.json<{ activeWorkspaceId?: string }>().activeWorkspaceId,
      "Session did not derive an active workspace from membership"
    );
    const profileUpdate = await app.inject({
      method: "PATCH",
      url: "/v1/me",
      payload: { displayName: "Maya Authenticated", locale: "en", timezone: "UTC" },
      headers: {
        cookie: initialCookie.header,
        origin: webOrigin,
        "x-csrf-token": initialCookie.csrf
      }
    });
    assert(profileUpdate.statusCode === 200, "Profile preference update failed");

    const noCsrf = await app.inject({
      method: "POST",
      url: "/v1/teams/10000000-0000-4000-8000-000000000001/workflows",
      payload: { name: "CSRF must fail" },
      headers: { cookie: initialCookie.header }
    });
    assert(noCsrf.statusCode === 403, "Cookie mutation accepted a missing origin and CSRF token");
    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/v1/teams/10000000-0000-4000-8000-000000000001/workflows",
      payload: { name: "Origin must fail" },
      headers: {
        cookie: initialCookie.header,
        origin: "https://attacker.invalid",
        "x-csrf-token": initialCookie.csrf
      }
    });
    assert(wrongOrigin.statusCode === 403, "Cookie mutation accepted a hostile origin");
    const mutation = await app.inject({
      method: "POST",
      url: "/v1/teams/10000000-0000-4000-8000-000000000001/workflows",
      payload: { name: "Authenticated workflow" },
      headers: {
        cookie: initialCookie.header,
        origin: webOrigin,
        "x-csrf-token": initialCookie.csrf
      }
    });
    assert(mutation.statusCode === 201, "Valid CSRF-protected mutation failed");

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/sessions/refresh",
      headers: {
        cookie: initialCookie.header,
        origin: webOrigin,
        "x-csrf-token": initialCookie.csrf
      }
    });
    assert(refresh.statusCode === 200, "Session rotation failed");
    const rotatedCookie = cookieHeader(refresh.headers["set-cookie"]);
    assert(rotatedCookie.session !== initialCookie.session, "Session verifier did not rotate");
    const reuse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: initialCookie.header }
    });
    assert(reuse.statusCode === 401, "Rotated verifier reuse was not rejected");
    const familyRevoked = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: rotatedCookie.header }
    });
    assert(familyRevoked.statusCode === 401, "Verifier reuse did not revoke the session family");

    const googleStart = await app.inject({
      method: "POST",
      url: "/edge/v1/auth/google/authorizations",
      payload: { returnTargetId: "sessions" }
    });
    assert(googleStart.statusCode === 200, "Google authorization start failed");
    const initiationSetCookie = googleStart.headers["set-cookie"];
    const initiationValue = (
      Array.isArray(initiationSetCookie) ? initiationSetCookie[0] : initiationSetCookie
    )?.split(";")[0];
    assert(initiationValue, "Google authorization omitted browser initiation binding");
    const authorizationUrl = new URL(
      googleStart.json<{ authorizationUrl: string }>().authorizationUrl
    );
    const state = authorizationUrl.searchParams.get("state");
    const nonce = authorizationUrl.searchParams.get("nonce");
    assert(state && nonce, "Google authorization omitted state or nonce");
    assert(
      authorizationUrl.searchParams.get("code_challenge_method") === "S256",
      "Google authorization omitted S256 PKCE"
    );
    const code = Buffer.from(
      JSON.stringify({ nonce, email: "maya@northstar.example", subject: "google-maya" })
    ).toString("base64url");
    const callback = await app.inject({
      method: "GET",
      url: `/callbacks/v1/identity/oauth/google?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`
    });
    assert(
      callback.statusCode === 303,
      "Google callback did not produce an isolated result redirect"
    );
    const callbackLocation = callback.headers.location;
    assert(callbackLocation, "Google callback omitted its clean result destination");
    const resultHandle = fragmentValue(callbackLocation, "result");
    assert(
      !callbackLocation.includes("code="),
      "Provider code leaked into the application redirect"
    );
    const crossBrowser = await app.inject({
      method: "POST",
      url: "/edge/v1/auth/google/exchange",
      payload: { resultHandle },
      headers: { cookie: "__Host-knotline-auth-init=wrong-browser-binding" }
    });
    assert(crossBrowser.statusCode === 400, "Cross-browser result exchange created a session");
    const googleExchange = await app.inject({
      method: "POST",
      url: "/edge/v1/auth/google/exchange",
      payload: { resultHandle },
      headers: { cookie: initiationValue }
    });
    assert(googleExchange.statusCode === 200, "Browser-bound Google result exchange failed");
    assert(
      googleExchange.json<{ returnTarget: string }>().returnTarget === "/app/profile/sessions",
      "Google exchange lost the allowlisted return target"
    );
    const googleCookie = cookieHeader(googleExchange.headers["set-cookie"]);
    const sessionList = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: { cookie: googleCookie.header }
    });
    assert(
      sessionList.statusCode === 200 &&
        sessionList
          .json<{ data: readonly { current: boolean }[] }>()
          .data.some(({ current }) => current),
      "Session inventory did not identify the current session"
    );
    const peerSession = sessionList
      .json<{ data: readonly { id: string; current: boolean; revokedAt?: string }[] }>()
      .data.find((session) => !session.current && !session.revokedAt);
    assert(peerSession, "Session inventory omitted a revocable peer session");
    const individualRevoke = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${peerSession.id}`,
      headers: {
        cookie: googleCookie.header,
        origin: webOrigin,
        "x-csrf-token": googleCookie.csrf
      }
    });
    assert(individualRevoke.statusCode === 204, "Individual session revocation failed");
    const revokeOthers = await app.inject({
      method: "POST",
      url: "/v1/auth/sessions/revoke-others",
      headers: {
        cookie: googleCookie.header,
        origin: webOrigin,
        "x-csrf-token": googleCookie.csrf
      }
    });
    assert(
      revokeOthers.statusCode === 200 && revokeOthers.json<{ revoked: number }>().revoked >= 1,
      "Revoke-other-sessions did not revoke peer sessions"
    );
    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        cookie: googleCookie.header,
        origin: webOrigin,
        "x-csrf-token": googleCookie.csrf
      }
    });
    assert(logout.statusCode === 204, "Logout did not revoke the current session");
    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: googleCookie.header }
    });
    assert(afterLogout.statusCode === 401, "Logged-out session retained API access");
    const resultReplay = await app.inject({
      method: "POST",
      url: "/edge/v1/auth/google/exchange",
      payload: { resultHandle },
      headers: { cookie: initiationValue }
    });
    assert(resultReplay.statusCode === 400, "Google result replay created another session");
    const callbackReplay = await app.inject({
      method: "GET",
      url: `/callbacks/v1/identity/oauth/google?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`
    });
    assert(callbackReplay.statusCode === 400, "Google callback transaction replay succeeded");

    const evilCors = await app.inject({
      method: "OPTIONS",
      url: "/v1/me",
      headers: {
        origin: "https://attacker.invalid",
        "access-control-request-method": "GET"
      }
    });
    assert(
      evilCors.headers["access-control-allow-origin"] !== "https://attacker.invalid",
      "CORS reflected an untrusted origin"
    );
  } finally {
    await app.close();
  }

  const notificationCount = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM security_notifications"
  );
  const identityLinkCount = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM identity_links"
  );
  assert((notificationCount.rows[0]?.count ?? 0) >= 4, "Security notifications were not persisted");
  assert(identityLinkCount.rows[0]?.count === 1, "Google identity was not linked exactly once");
  assert(
    await repository.userById("20000000-0000-4000-8000-000000000001"),
    "Seed identity disappeared"
  );
  return {
    magicLink: {
      replayRejected: true,
      expiryRejected: true,
      raceWinnerCount: 1,
      identityRateLimit: 5
    },
    session: {
      httpOnly: true,
      secure: true,
      csrf: true,
      rotation: true,
      reuseFamilyRevocation: true,
      inventory: true,
      individualRevoke: true,
      revokeOthers: true,
      logout: true
    },
    google: {
      state: true,
      nonce: true,
      pkceS256: true,
      browserBinding: true,
      resultReplayRejected: true,
      issuerAudienceExpiryAndIdentityNegatives: true
    },
    cors: { exactOrigin: true },
    securityNotifications: notificationCount.rows[0]?.count ?? 0
  };
}

let pool: DatabasePool | undefined;
let runtimePool: DatabasePool | undefined;
try {
  const started = await startPostgres();
  pool = started.pool;
  await migrate(started.adminUrl);
  await seedSyntheticTenants(pool);
  await pool.query("ALTER ROLE knotline_runtime LOGIN PASSWORD 'local-only-m04-runtime-password'");
  const runtimeUrl = new URL(started.adminUrl);
  runtimeUrl.username = "knotline_runtime";
  runtimeUrl.password = "local-only-m04-runtime-password";
  runtimePool = createPool(runtimeUrl.toString(), { max: 20 });
  const result = await runSuite(runtimePool);
  const directory = resolve("artifacts/security/M04");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "auth-security.json"),
    `${JSON.stringify({ schemaVersion: 1, image: IMAGE, retries: 0, result }, null, 2)}\n`
  );
  process.stdout.write("M04 authentication security suite passed.\n");
} catch (error) {
  const logs = spawnSync("docker", ["logs", "--tail", "200", containerName], { encoding: "utf8" });
  process.stderr.write(logs.stdout ?? "");
  process.stderr.write(logs.stderr ?? "");
  throw error;
} finally {
  await runtimePool?.end();
  await pool?.end();
  spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
}
