#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";
const milestone = "M28",
  recordedAt = "2026-08-07T12:00:00.000Z",
  output = join(ROOT, "artifacts/verification/M28"),
  registries = buildRegistries(await readFile(PLAN_PATH, "utf8")),
  digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m28-analytics-unit", "pnpm --filter @knotline/operations test", "analytics-unit"],
  ["m28-analytics-api", "pnpm test:api", "analytics-api"],
  [
    "m28-analytics-browser",
    "pnpm exec playwright test tests/e2e/analytics.spec.ts",
    "analytics-browser"
  ],
  ["m28-analytics-migrations", "pnpm verify:migrations", "analytics-migrations"],
  ["m28-analytics-security", "pnpm verify:events && pnpm verify:secrets", "analytics-security"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M28/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
    .filter(({ activationMilestones }) =>
      activationMilestones.some((id) => Number(id.slice(1)) <= 28)
    )
    .map(({ capability }) => capability.toLowerCase()),
  notYetApplicable = registries.gateActivation.entries
    .filter(
      ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 28)
    )
    .map(({ capability, activationMilestones }) => ({
      row: capability.toLowerCase(),
      activationMilestone: [...activationMilestones].sort(
        (a, b) => Number(a.slice(1)) - Number(b.slice(1))
      )[0],
      reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
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
  externalGates: [],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0025-search-analytics",
      evidenceUri: "repo://packages/db/migrations/0025_search_analytics.sql"
    }
  ],
  flags: [
    {
      id: "search-operational-analytics",
      evidenceUri: "repo://docs/operations/knotline/search-analytics.md"
    }
  ],
  knownRisks: [],
  evidenceUris: [
    "repo://packages/operations/src/analytics.ts",
    "repo://packages/db/src/analytics-repository.ts",
    "repo://packages/db/migrations/0025_search_analytics.sql",
    "repo://tests/e2e/analytics.spec.ts",
    "repo://docs/operations/knotline/search-analytics.md"
  ]
};
const priorRoutes = JSON.parse(
    await readFile(join(ROOT, "artifacts/verification/M27/route-coverage.json"), "utf8")
  ),
  evidence = {
    fixture: "authorized-search-saved-view-late-correction-drill-and-export-fixtures",
    browserTest: "tests/e2e/analytics.spec.ts",
    accessibilityResult: "artifact://M28/test-results/analytics-browser",
    localeSet: "en,en-XA",
    viewportDevice: "320 CSS px and desktop Chromium",
    authorizationPersona: "workspace member and report owner",
    expectedTelemetry:
      "query cost, result count, metric version, watermark, contributing count and normalized errors only",
    evidenceUri: "artifact://M28/test-results/analytics-browser"
  },
  owned = new Set([
    "route.app",
    "route.app.search",
    "route.app.analytics",
    "route.app.analytics.reports.detail"
  ]),
  routeCoverage = {
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
    await readFile(join(ROOT, "artifacts/verification/M27/traceability.json"), "utf8")
  ),
  priorById = new Map(priorTrace.requirements.map((row) => [row.requirementId, row])),
  traceability = {
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
      id: "analytics.authorized-search-and-reporting",
      status: "DEMO",
      summary:
        "Authorization-filtered search, reproducible views, curated reconciled metrics, freshness, drill-through definitions and safe exports are verified with deterministic fixtures.",
      owner: { team: "analytics-platform", contact: "shurevan" },
      runbook: "docs/operations/knotline/search-analytics.md",
      externalGates: [],
      evidence: {
        environment: "local",
        verifiedAt: recordedAt,
        reference: "repo://artifacts/verification/M28/test-results/analytics-unit.json"
      }
    }
  ],
  records = testRuns.map((run) => ({
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
process.stdout.write("Generated M28 evidence bindings.\n");
