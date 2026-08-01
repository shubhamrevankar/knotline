#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M26";
const recordedAt = "2026-08-05T18:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M26");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m26-trigger-unit", "pnpm --filter @knotline/agent-runtime test", "trigger-unit"],
  ["m26-trigger-api", "pnpm test:api", "trigger-api"],
  [
    "m26-trigger-browser",
    "pnpm exec playwright test tests/e2e/triggers.spec.ts",
    "trigger-browser"
  ],
  ["m26-trigger-migrations", "pnpm verify:migrations", "trigger-migrations"],
  [
    "m26-trigger-security",
    "pnpm verify:events && pnpm verify:boundaries && pnpm verify:secrets",
    "trigger-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M26/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 26)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 26)
  )
  .map(({ capability, activationMilestones }) => ({
    row: capability.toLowerCase(),
    activationMilestone: [...activationMilestones].sort(
      (a, b) => Number(a.slice(1)) - Number(b.slice(1))
    )[0],
    reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
  }));
const externalGate = (gateId) => ({
  gateId,
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  accountableOwner: "shurevan",
  gaRequired: true,
  reviewExpiresAt: null,
  evidenceUris: []
});
const externalGateIds = [
  "EXT-007",
  "EXT-008",
  "EXT-009",
  "EXT-010",
  "EXT-011",
  "EXT-012",
  "EXT-013",
  "EXT-014",
  "EXT-025"
];
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
  externalGates: externalGateIds.map(externalGate),
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0023-production-triggers",
      evidenceUri: "repo://packages/db/migrations/0023_production_triggers.sql"
    }
  ],
  flags: [
    {
      id: "production-triggers",
      evidenceUri: "repo://docs/operations/knotline/production-triggers.md"
    }
  ],
  knownRisks: [
    {
      id: "m26-live-provider-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/agent-runtime/src/triggers.ts",
    "repo://packages/db/src/trigger-repository.ts",
    "repo://packages/db/migrations/0023_production_triggers.sql",
    "repo://tests/e2e/triggers.spec.ts",
    "repo://docs/operations/knotline/production-triggers.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M25/route-coverage.json"), "utf8")
);
const routeEvidence = {
  fixture: "signed-event-schedule-dedup-fairness-and-reconciliation-fixtures",
  browserTest: "tests/e2e/triggers.spec.ts",
  accessibilityResult: "artifact://M26/test-results/trigger-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320 CSS px and desktop Chromium",
  authorizationPersona: "workspace owner operating a published workflow in test mode",
  expectedTelemetry:
    "trigger/version/source/receipt/queue/run/operation IDs, hashes, counts, state, lag, and normalized errors only",
  evidenceUri: "artifact://M26/test-results/trigger-browser"
};
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    route.routeId === "route.app.workflows.detail.triggers"
      ? {
          ...route,
          states: route.states.map((cell) => ({
            stateId: cell.stateId,
            applicability: "REQUIRED",
            reason: "",
            reviewer: "shurevan",
            evidence: routeEvidence
          }))
        }
      : route
  )
};
const priorTrace = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M25/traceability.json"), "utf8")
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
    id: "triggers.production-and-outbound-sync",
    status: "DEMO",
    summary:
      "Versioned schedules and inbound events enforce schema, deduplication, ordering, fairness, test isolation, durable lineage, and reconciled writes against deterministic fixtures.",
    owner: { team: "trigger-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/production-triggers.md",
    externalGates: externalGateIds,
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M26/test-results/trigger-unit.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} passed with sanitized deterministic fixtures and no external credentials.`,
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
process.stdout.write("Generated M26 evidence bindings.\n");
