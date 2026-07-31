export type RuntimeEnvironment =
  "local" | "ci" | "development" | "staging" | "production" | "recovery";

export interface RuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly api: {
    readonly port: number;
    readonly publicOrigin: URL;
    readonly webOrigin: URL;
  };
  readonly databaseUrl: URL;
  readonly redisUrl: URL;
  readonly temporal: {
    readonly address: string;
    readonly namespace: string;
  };
  readonly objectStorage: {
    readonly endpoint: URL;
    readonly region: string;
    readonly accessKeyReference: string;
    readonly secretKeyReference: string;
  };
}

export class ConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid runtime configuration:\n- ${issues.join("\n- ")}`);
    this.name = "ConfigurationError";
    this.issues = issues;
  }
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const environmentNames = new Set<RuntimeEnvironment>([
  "local",
  "ci",
  "development",
  "staging",
  "production",
  "recovery"
]);
const logLevels = new Set<RuntimeConfig["logLevel"]>(["debug", "info", "warn", "error"]);

const localDefaults = {
  KNOTLINE_API_PORT: "4100",
  KNOTLINE_API_ORIGIN: "http://localhost:4100",
  KNOTLINE_WEB_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://knotline_runtime:local-only-runtime-password@localhost:5432/knotline",
  REDIS_URL: "redis://localhost:6379",
  TEMPORAL_ADDRESS: "localhost:7233",
  TEMPORAL_NAMESPACE: "default",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "local",
  S3_ACCESS_KEY_REFERENCE: "local-only:knotline",
  S3_SECRET_KEY_REFERENCE: "local-only:knotline-local-only-password"
} as const;

function parseUrl(name: string, value: string | undefined, issues: string[]): URL {
  if (!value) {
    issues.push(`${name} is required`);
    return new URL("http://invalid.example");
  }
  try {
    const parsed = new URL(value);
    if (!parsed.hostname) issues.push(`${name} must include a host`);
    return parsed;
  } catch {
    issues.push(`${name} must be an absolute URL`);
    return new URL("http://invalid.example");
  }
}

function parseHostPort(name: string, value: string, issues: string[]): URL {
  try {
    const parsed = new URL(`tcp://${value}`);
    const port = Number(parsed.port);
    if (
      !parsed.hostname ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535 ||
      parsed.pathname !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error("invalid host and port");
    }
    return parsed;
  } catch {
    issues.push(`${name} must be a host and port`);
    return new URL("tcp://invalid.example:1");
  }
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
}

function isUnsafeSecretReference(reference: string): boolean {
  const normalized = reference.toLowerCase();
  return (
    normalized.startsWith("local-only:") ||
    normalized.includes("change-me") ||
    normalized.includes("password") ||
    normalized.includes("not-a-secret")
  );
}

function isOriginOnly(url: URL): boolean {
  return (
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function required(source: EnvironmentSource, name: string, issues: string[]): string {
  const value = source[name]?.trim();
  if (!value) {
    issues.push(`${name} is required`);
    return "";
  }
  return value;
}

function processEnvironment(): EnvironmentSource {
  return (globalThis as { process?: { env?: EnvironmentSource } }).process?.env ?? {};
}

export function loadConfig(source: EnvironmentSource = processEnvironment()): RuntimeConfig {
  const rawEnvironment = source.KNOTLINE_ENV?.trim() ?? "local";
  const issues: string[] = [];
  if (!environmentNames.has(rawEnvironment as RuntimeEnvironment)) {
    issues.push(`KNOTLINE_ENV must be one of ${[...environmentNames].join(", ")}`);
  }
  const environment = environmentNames.has(rawEnvironment as RuntimeEnvironment)
    ? (rawEnvironment as RuntimeEnvironment)
    : "local";
  const values: EnvironmentSource =
    environment === "local" || environment === "ci" ? { ...localDefaults, ...source } : source;

  const rawLogLevel = values.LOG_LEVEL?.trim() ?? "info";
  if (!logLevels.has(rawLogLevel as RuntimeConfig["logLevel"])) {
    issues.push("LOG_LEVEL must be debug, info, warn, or error");
  }
  const logLevel = logLevels.has(rawLogLevel as RuntimeConfig["logLevel"])
    ? (rawLogLevel as RuntimeConfig["logLevel"])
    : "info";

  const rawPort = required(values, "KNOTLINE_API_PORT", issues);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    issues.push("KNOTLINE_API_PORT must be an integer between 1 and 65535");
  }

  const publicOrigin = parseUrl("KNOTLINE_API_ORIGIN", values.KNOTLINE_API_ORIGIN, issues);
  const webOrigin = parseUrl("KNOTLINE_WEB_ORIGIN", values.KNOTLINE_WEB_ORIGIN, issues);
  const databaseUrl = parseUrl("DATABASE_URL", values.DATABASE_URL, issues);
  const redisUrl = parseUrl("REDIS_URL", values.REDIS_URL, issues);
  const objectEndpoint = parseUrl("S3_ENDPOINT", values.S3_ENDPOINT, issues);
  const temporalAddress = required(values, "TEMPORAL_ADDRESS", issues);
  const temporalUrl = parseHostPort("TEMPORAL_ADDRESS", temporalAddress, issues);
  const temporalNamespace = required(values, "TEMPORAL_NAMESPACE", issues);
  const objectRegion = required(values, "S3_REGION", issues);
  const accessKeyReference = required(values, "S3_ACCESS_KEY_REFERENCE", issues);
  const secretKeyReference = required(values, "S3_SECRET_KEY_REFERENCE", issues);

  if (!new Set(["http:", "https:"]).has(publicOrigin.protocol)) {
    issues.push("KNOTLINE_API_ORIGIN must use HTTP or HTTPS");
  }
  if (!new Set(["http:", "https:"]).has(webOrigin.protocol)) {
    issues.push("KNOTLINE_WEB_ORIGIN must use HTTP or HTTPS");
  }
  if (!isOriginOnly(publicOrigin)) {
    issues.push("KNOTLINE_API_ORIGIN must contain only an origin");
  }
  if (!isOriginOnly(webOrigin)) {
    issues.push("KNOTLINE_WEB_ORIGIN must contain only an origin");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
    issues.push("DATABASE_URL must use PostgreSQL");
  }
  if (!new Set(["redis:", "rediss:"]).has(redisUrl.protocol)) {
    issues.push("REDIS_URL must use Redis");
  }
  if (!new Set(["http:", "https:"]).has(objectEndpoint.protocol)) {
    issues.push("S3_ENDPOINT must use HTTP or HTTPS");
  }

  if (environment === "production" || environment === "recovery") {
    for (const [name, url] of [
      ["KNOTLINE_API_ORIGIN", publicOrigin],
      ["KNOTLINE_WEB_ORIGIN", webOrigin],
      ["S3_ENDPOINT", objectEndpoint]
    ] as const) {
      if (url.protocol !== "https:") issues.push(`${name} must use HTTPS in ${environment}`);
      if (isLoopback(url.hostname)) {
        issues.push(`${name} cannot use a loopback host in ${environment}`);
      }
    }
    if (isLoopback(databaseUrl.hostname)) {
      issues.push(`DATABASE_URL cannot use a loopback host in ${environment}`);
    }
    if (isLoopback(redisUrl.hostname)) {
      issues.push(`REDIS_URL cannot use a loopback host in ${environment}`);
    }
    if (
      !new Set(["require", "verify-ca", "verify-full"]).has(
        databaseUrl.searchParams.get("sslmode") ?? ""
      )
    ) {
      issues.push(`DATABASE_URL must enforce TLS with sslmode in ${environment}`);
    }
    if (
      isUnsafeSecretReference(databaseUrl.username) ||
      isUnsafeSecretReference(databaseUrl.password)
    ) {
      issues.push(`DATABASE_URL cannot contain local-only credentials in ${environment}`);
    }
    if (redisUrl.protocol !== "rediss:") issues.push(`REDIS_URL must use rediss in ${environment}`);
    if (isUnsafeSecretReference(redisUrl.username) || isUnsafeSecretReference(redisUrl.password)) {
      issues.push(`REDIS_URL cannot contain local-only credentials in ${environment}`);
    }
    if (isLoopback(temporalUrl.hostname)) {
      issues.push(`TEMPORAL_ADDRESS cannot use a loopback host in ${environment}`);
    }
    if (isUnsafeSecretReference(accessKeyReference)) {
      issues.push(`S3_ACCESS_KEY_REFERENCE must point to an external secret in ${environment}`);
    }
    if (isUnsafeSecretReference(secretKeyReference)) {
      issues.push(`S3_SECRET_KEY_REFERENCE must point to an external secret in ${environment}`);
    }
  }

  if (issues.length > 0) throw new ConfigurationError(issues);

  return Object.freeze({
    environment,
    logLevel,
    api: Object.freeze({ port, publicOrigin, webOrigin }),
    databaseUrl,
    redisUrl,
    temporal: Object.freeze({ address: temporalAddress, namespace: temporalNamespace }),
    objectStorage: Object.freeze({
      endpoint: objectEndpoint,
      region: objectRegion,
      accessKeyReference,
      secretKeyReference
    })
  });
}
