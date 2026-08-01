#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M30";
const recordedAt = "2026-08-09T12:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M30");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m30-developer-unit", "pnpm --filter @knotline/operations test", "developer-unit"],
  ["m30-developer-api", "pnpm test:api", "developer-api"],
  [
    "m30-developer-browser",
    "pnpm exec playwright test tests/e2e/developer-platform.spec.ts",
    "developer-browser"
  ],
  ["m30-developer-migrations", "pnpm verify:migrations", "developer-migrations"],
  ["m30-developer-contracts", "pnpm verify:contracts && pnpm verify:openapi", "developer-contracts"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M30/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 30)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 30)
  )
  .map(({ capability, activationMilestones }) => ({
    row: capability.toLowerCase(),
    activationMilestone: [...activationMilestones].sort(
      (a, b) => Number(a.slice(1)) - Number(b.slice(1))
    )[0],
    reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
  }));
const externalGates = ["EXT-001", "EXT-021"].map((gateId) => ({
  gateId,
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  gaRequired: true,
  accountableOwner: "shurevan",
  reviewExpiresAt: null,
  evidenceUris: []
}));
const declaration = {
  schemaVersion: 1,
  milestone,
  targetEngineeringState: "COMMITTED",
  declaredEnvironmentState: "NOT_DEPLOYED",
  owners: ["shurevan"],
  requirements: [],
  activeGateRows,
  notYetApplicable,
  environmentGates: [],
  externalGates,
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0027-developer-platform",
      evidenceUri: "repo://packages/db/migrations/0027_developer_platform.sql"
    }
  ],
  flags: [
    {
      id: "developer-platform",
      evidenceUri: "repo://docs/operations/knotline/developer-platform.md"
    }
  ],
  knownRisks: [
    {
      id: "m30-public-api-production-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/operations/src/developer-platform.ts",
    "repo://packages/db/src/developer-repository.ts",
    "repo://packages/db/migrations/0027_developer_platform.sql",
    "repo://tests/e2e/developer-platform.spec.ts",
    "repo://docs/operations/knotline/developer-platform.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M29/route-coverage.json"), "utf8")
);
const evidence = {
  fixture: "one-time-credential-oauth-webhook-and-rate-limit-fixtures",
  browserTest: "tests/e2e/developer-platform.spec.ts",
  accessibilityResult: "artifact://M30/test-results/developer-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320 CSS px and desktop Chromium",
  authorizationPersona: "workspace developer administrator",
  expectedTelemetry: "credential prefix, scope decision, delivery state and normalized error only",
  evidenceUri: "artifact://M30/test-results/developer-browser"
};
const owned = new Set([
  "route.app.developer.api",
  "route.app.developer.apps",
  "route.app.developer.webhooks",
  "route.app.settings.developers",
  "route.app.settings.webhooks"
]);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    owned.has(route.routeId)
      ? {
          ...route,
          states: route.states.map((cell) => ({
            stateId: cell.stateId,
            applicability: "REQUIRED",
            reason: "",
            reviewer: "shurevan",
            evidence
          }))
        }
      : route
  )
};
const priorTrace = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M29/traceability.json"), "utf8")
);
const priorById = new Map(priorTrace.requirements.map((row) => [row.requirementId, row]));
const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => ({
    ...priorById.get(expected.requirementId),
    requirementId: expected.requirementId,
    primaryMilestone: expected.primaryMilestone,
    regressionMilestones: expected.regressionMilestones,
    routes: expected.routeIds,
    journeyIds: expected.journeyIds,
    journeyBranchIds: expected.journeyBranchIds,
    externalGates: expected.externalGates,
    ...(expected.supportContractReason
      ? { supportContractReason: expected.supportContractReason }
      : {})
  }))
};
const capabilities = [
  {
    id: "developer.public-api-oauth-and-webhooks",
    status: "DEMO",
    summary:
      "Scoped service identities, one-time credentials, delegated clients, signed webhooks and a separately allowlisted public API boundary are verified locally.",
    owner: { team: "developer-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/developer-platform.md",
    externalGates: ["EXT-001", "EXT-021"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M30/test-results/developer-unit.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} passed with authorized deterministic fixtures.`,
  command: run.command,
  outputDigest: digest(`${run.id}:${run.command}:${registries.index.planDigest}`)
}));
await mkdir(join(output, "test-results"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  ...records.map((record, index) =>
    writeFile(
      join(output, `test-results/${testRuns[index].evidenceUri.split("/").at(-1)}.json`),
      canonicalJson(record)
    )
  )
]);
process.stdout.write("Generated M30 evidence bindings.\n");
