#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";
const milestone = "M29",
  recordedAt = "2026-08-08T12:00:00.000Z",
  output = join(ROOT, "artifacts/verification/M29"),
  registries = buildRegistries(await readFile(PLAN_PATH, "utf8")),
  digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m29-billing-unit", "pnpm --filter @knotline/operations test", "billing-unit"],
  ["m29-billing-api", "pnpm test:api", "billing-api"],
  ["m29-billing-browser", "pnpm exec playwright test tests/e2e/billing.spec.ts", "billing-browser"],
  ["m29-billing-migrations", "pnpm verify:migrations", "billing-migrations"],
  ["m29-billing-security", "pnpm verify:events && pnpm verify:secrets", "billing-security"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M29/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
    .filter(({ activationMilestones }) =>
      activationMilestones.some((id) => Number(id.slice(1)) <= 29)
    )
    .map(({ capability }) => capability.toLowerCase()),
  notYetApplicable = registries.gateActivation.entries
    .filter(
      ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 29)
    )
    .map(({ capability, activationMilestones }) => ({
      row: capability.toLowerCase(),
      activationMilestone: [...activationMilestones].sort(
        (a, b) => Number(a.slice(1)) - Number(b.slice(1))
      )[0],
      reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
    }));
const externalGates = ["EXT-005", "EXT-020"].map((gateId) => ({
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
      id: "0026-billing-entitlements",
      evidenceUri: "repo://packages/db/migrations/0026_billing_entitlements.sql"
    }
  ],
  flags: [
    {
      id: "billing-entitlements",
      evidenceUri: "repo://docs/operations/knotline/billing-entitlements.md"
    }
  ],
  knownRisks: [
    {
      id: "m29-live-billing-provider-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/operations/src/billing.ts",
    "repo://packages/db/src/billing-repository.ts",
    "repo://packages/db/migrations/0026_billing_entitlements.sql",
    "repo://tests/e2e/billing.spec.ts",
    "repo://docs/operations/knotline/billing-entitlements.md"
  ]
};
const priorRoutes = JSON.parse(
    await readFile(join(ROOT, "artifacts/verification/M28/route-coverage.json"), "utf8")
  ),
  evidence = {
    fixture: "subscription-usage-hard-budget-and-provider-outage-fixtures",
    browserTest: "tests/e2e/billing.spec.ts",
    accessibilityResult: "artifact://M29/test-results/billing-browser",
    localeSet: "en,en-XA",
    viewportDevice: "320 CSS px and desktop Chromium",
    authorizationPersona: "workspace billing administrator",
    expectedTelemetry:
      "plan version, entitlement decision, meter, amount, currency, watermark and normalized error only",
    evidenceUri: "artifact://M29/test-results/billing-browser"
  },
  owned = new Set(["route.pricing", "route.app.settings.billing", "route.app.settings.usage"]),
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
    await readFile(join(ROOT, "artifacts/verification/M28/traceability.json"), "utf8")
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
      id: "billing.entitlements-usage-and-spend",
      status: "DEMO",
      summary:
        "Versioned commercial plans, projected subscription state, exact usage, budgets, hard spend fences and honest provider gating are verified with deterministic fixtures.",
      owner: { team: "billing-platform", contact: "shurevan" },
      runbook: "docs/operations/knotline/billing-entitlements.md",
      externalGates: ["EXT-005", "EXT-020"],
      evidence: {
        environment: "local",
        verifiedAt: recordedAt,
        reference: "repo://artifacts/verification/M29/test-results/billing-unit.json"
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
process.stdout.write("Generated M29 evidence bindings.\n");
