import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentRecord, migrationDecision, promotionDecision } from "./model.mjs";
test("deployment record binds one signed digest and staging-production module parity", () => {
  const digest = `sha256:${"a".repeat(64)}`,
    record = deploymentRecord({
      artifactDigest: digest,
      stagingModuleDigest: "m1",
      productionModuleDigest: "m1",
      environment: "production"
    });
  assert.match(record.recordDigest, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() =>
    deploymentRecord({
      artifactDigest: "latest",
      stagingModuleDigest: "m1",
      productionModuleDigest: "m1"
    })
  );
  assert.throws(() =>
    deploymentRecord({
      artifactDigest: digest,
      stagingModuleDigest: "m1",
      productionModuleDigest: "m2"
    })
  );
});
test("migration and promotion gates fail closed", () => {
  assert.deepEqual(
    migrationDecision({
      expandCompatible: true,
      previousVersionReadsNewSchema: true,
      errorRate: 0,
      errorBudget: 0.01
    }),
    { allowed: true, action: "continue" }
  );
  assert.equal(migrationDecision({ expandCompatible: false }).allowed, false);
  const safe = {
    signatureVerified: true,
    sbomVerified: true,
    provenanceVerified: true,
    migrationsCompatible: true,
    healthGate: true,
    materialTopologyDiff: false
  };
  assert.equal(promotionDecision(safe).allowed, true);
  for (const patch of [
    { signatureVerified: false },
    { sbomVerified: false },
    { provenanceVerified: false },
    { migrationsCompatible: false },
    { healthGate: false },
    { materialTopologyDiff: true }
  ])
    assert.equal(promotionDecision({ ...safe, ...patch }).allowed, false);
});
test("deploy workflow uses OIDC protected environment and no access key", async () => {
  const yaml = await readFile(
    new URL("../../.github/workflows/deploy.yml", import.meta.url),
    "utf8"
  );
  assert.match(yaml, /id-token: write/);
  assert.match(yaml, /environment: \$\{\{ inputs\.environment \}\}/);
  assert.match(yaml, /role-to-assume/);
  assert.doesNotMatch(yaml, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});
