import { loadConfig } from "@knotline/config";
import {
  PostgresAuthRepository,
  createPool,
  migrate,
  PostgresWorkflowRepository,
  seedSyntheticTenants
} from "@knotline/db";

import { buildApp } from "./app.js";
import {
  AuthService,
  CaptureAuthMailer,
  LocalOidcClient,
  RemoteGoogleOidcClient,
  SesAuthMailer
} from "./auth.js";

const environment = loadConfig(process.env);
if (environment.environment === "local") {
  const migrationUrl = process.env.DB_MIGRATION_URL;
  if (!migrationUrl) throw new Error("DB_MIGRATION_URL is required in local mode");
  await migrate(migrationUrl);
  const migrationPool = createPool(migrationUrl, { max: 1 });
  try {
    await seedSyntheticTenants(migrationPool);
  } finally {
    await migrationPool.end();
  }
}
const pool = createPool(environment.databaseUrl.href);
const repository = new PostgresWorkflowRepository(pool, (observation) => {
  process.stdout.write(`${JSON.stringify({ event: "database.query", ...observation })}\n`);
});
const authRepository = new PostgresAuthRepository(pool);
const isLocal = environment.environment === "local" || environment.environment === "ci";
const googleIssuer = isLocal
  ? `${environment.api.publicOrigin.origin}/__local/oidc`
  : (process.env.GOOGLE_OIDC_ISSUER ?? "https://accounts.google.com");
const googleClientId = isLocal
  ? "knotline-local-client"
  : (process.env.GOOGLE_OIDC_CLIENT_ID ?? "");
if (!googleClientId) throw new Error("GOOGLE_OIDC_CLIENT_ID is required outside local mode");
if (!isLocal && !process.env.GOOGLE_OIDC_CLIENT_SECRET) {
  throw new Error("GOOGLE_OIDC_CLIENT_SECRET is required outside local mode");
}
if (!isLocal && (process.env.AUTH_TRANSACTION_ENCRYPTION_KEY?.length ?? 0) < 32) {
  throw new Error(
    "AUTH_TRANSACTION_ENCRYPTION_KEY must be at least 32 characters outside local mode"
  );
}
if (!isLocal && !process.env.AWS_SES_REGION) {
  throw new Error("AWS_SES_REGION is required outside local mode");
}
if (!isLocal && !process.env.AUTH_EMAIL_FROM) {
  throw new Error("AUTH_EMAIL_FROM is required outside local mode");
}
if (!isLocal && !process.env.KNOTLINE_TRUSTED_PROXY) {
  throw new Error("KNOTLINE_TRUSTED_PROXY is required outside local mode");
}
const googleAuthorizationEndpoint = isLocal
  ? `${environment.api.publicOrigin.origin}/__local/oidc/authorize`
  : (process.env.GOOGLE_OIDC_AUTHORIZATION_ENDPOINT ??
    "https://accounts.google.com/o/oauth2/v2/auth");
const captureMailer = isLocal ? new CaptureAuthMailer() : undefined;
const mailer =
  captureMailer ??
  new SesAuthMailer(
    process.env.AWS_SES_REGION ?? "us-east-1",
    process.env.AUTH_EMAIL_FROM ?? "signin@localhost.invalid"
  );
const oidc = isLocal
  ? new LocalOidcClient(googleIssuer, googleClientId)
  : new RemoteGoogleOidcClient(
      googleIssuer,
      googleClientId,
      process.env.GOOGLE_OIDC_TOKEN_ENDPOINT ?? "https://oauth2.googleapis.com/token",
      process.env.GOOGLE_OIDC_JWKS_URI ?? "https://www.googleapis.com/oauth2/v3/certs",
      process.env.GOOGLE_OIDC_CLIENT_SECRET
    );
const auth = new AuthService(authRepository, mailer, oidc, {
  environment: environment.environment,
  apiOrigin: environment.api.publicOrigin.origin,
  webOrigin: environment.api.webOrigin.origin,
  encryptionKey:
    process.env.AUTH_TRANSACTION_ENCRYPTION_KEY ?? "local-only-knotline-auth-encryption-key",
  google: {
    issuer: googleIssuer,
    clientId: googleClientId,
    authorizationEndpoint: googleAuthorizationEndpoint
  }
});

const app = await buildApp({
  environment: environment.environment,
  logLevel: environment.logLevel,
  webOrigin: environment.api.webOrigin.origin,
  repository,
  auth,
  ...(captureMailer ? { captureMailer } : {}),
  ...(process.env.KNOTLINE_TRUSTED_PROXY
    ? { trustedProxy: process.env.KNOTLINE_TRUSTED_PROXY }
    : {}),
  mutationsDisabled: process.env.KNOTLINE_MUTATIONS_DISABLED === "true"
});

app.addHook("onClose", async () => pool.end());

await app.listen({ host: "0.0.0.0", port: environment.api.port });
