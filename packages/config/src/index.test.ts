import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./index.js";

const safeProduction = {
  KNOTLINE_ENV: "production",
  LOG_LEVEL: "info",
  KNOTLINE_API_PORT: "4100",
  KNOTLINE_API_ORIGIN: "https://api.knotline.example",
  KNOTLINE_WEB_ORIGIN: "https://app.knotline.example",
  DATABASE_URL: "postgresql://app@db.internal/knotline?sslmode=verify-full",
  REDIS_URL: "rediss://cache.internal:6379",
  TEMPORAL_ADDRESS: "temporal.internal:7233",
  TEMPORAL_NAMESPACE: "production",
  S3_ENDPOINT: "https://objects.internal",
  S3_REGION: "ap-south-1",
  S3_ACCESS_KEY_REFERENCE: "secrets-manager:knotline/production/s3-access-key",
  S3_SECRET_KEY_REFERENCE: "secrets-manager:knotline/production/s3-secret-key"
} as const;

describe("loadConfig", () => {
  it("provides deterministic local-only defaults", () => {
    const config = loadConfig({ KNOTLINE_ENV: "local" });
    expect(config.api.port).toBe(4100);
    expect(config.databaseUrl.hostname).toBe("localhost");
    expect(config.objectStorage.secretKeyReference).toMatch(/^local-only:/u);
  });

  it("accepts explicit safe production configuration", () => {
    const config = loadConfig(safeProduction);
    expect(config.environment).toBe("production");
    expect(config.api.publicOrigin.protocol).toBe("https:");
    expect(config.redisUrl.protocol).toBe("rediss:");
  });

  it.each([
    ["local origin", { KNOTLINE_WEB_ORIGIN: "http://localhost:5173" }],
    ["plain Redis", { REDIS_URL: "redis://cache.internal:6379" }],
    ["local secret", { S3_SECRET_KEY_REFERENCE: "local-only:not-a-secret" }],
    ["database without TLS policy", { DATABASE_URL: "postgresql://app@db.internal/knotline" }],
    [
      "disabled database TLS",
      { DATABASE_URL: "postgresql://app@db.internal/knotline?sslmode=disable" }
    ],
    ["origin with credentials", { KNOTLINE_API_ORIGIN: "https://user@api.knotline.example" }]
  ])("rejects unsafe production %s", (_label, override) => {
    expect(() => loadConfig({ ...safeProduction, ...override })).toThrow(ConfigurationError);
  });

  it("reports every missing value outside local and CI", () => {
    expect(() => loadConfig({ KNOTLINE_ENV: "staging" })).toThrow(/KNOTLINE_API_PORT/u);
  });
});
