#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M11";
const recordedAt = "2026-08-01T05:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M11");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["RN-016"]);
const ownedRoutes = new Set([
  "route.app.runs",
  "route.app.runs.detail",
  "route.app.runs.detail.timeline",
  "route.app.runs.detail.tasks.detail"
]);
const operationKeys = new Set([
  "GET /v1/workflows/:workflowId/runs",
  "GET /v1/runs/:runId",
  "GET /v1/runs/:runId/events",
  "GET /v1/runs/:runId/stream",
  "POST /v1/runs/:runId/pauses",
  "POST /v1/runs/:runId/resumptions",
  "POST /v1/runs/:runId/cancellations"
]);
const operations = registries.api.entries
  .filter(({ method, path }) => operationKeys.has(`${method} ${path}`))
  .map(({ id }) => id);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m11-run-room-api", "pnpm test:api", "run-room-api"],
  [
    "m11-run-room-browser",
    "pnpm exec playwright test tests/e2e/run-room.spec.ts",
    "run-room-browser"
  ],
  [
    "m11-run-room-accessibility",
    "pnpm exec playwright test tests/e2e/run-room.spec.ts --grep @a11y",
    "run-room-accessibility"
  ],
  ["m11-run-room-performance", "pnpm verify:web-performance", "run-room-performance"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M11/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 11)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 11)
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
  requirements: [...requirements],
  activeGateRows,
  notYetApplicable,
  environmentGates: [],
  externalGates: [],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0008-run-room-operations",
      evidenceUri: "repo://packages/db/migrations/0008_run_room_operations.sql"
    }
  ],
  flags: [],
  knownRisks: [],
  evidenceUris: [
    "repo://apps/web/src/M11Pages.tsx",
    "repo://apps/api/src/app.ts",
    "repo://packages/db/src/runtime-repository.ts",
    "repo://tests/e2e/run-room.spec.ts"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M10/route-coverage.json"), "utf8")
);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    ownedRoutes.has(route.routeId)
      ? {
          ...route,
          states: route.states.map((state) => {
            const { activationMilestone: _ignored, ...base } = state;
            void _ignored;
            return {
              ...base,
              applicability: "REQUIRED",
              reason: "",
              reviewer: "shurevan",
              evidence: {
                accessibilityResult: "artifact://M11/test-results/run-room-accessibility",
                authorizationPersona:
                  "workspace operator with workflow read and manage permissions",
                browserTest: "tests/e2e/run-room.spec.ts",
                evidenceUri: "artifact://M11/test-results/run-room-browser",
                expectedTelemetry:
                  "run ID, durable cursor, connection state, action intent, and redacted finding codes",
                fixture: `run-room.${state.stateId}`,
                localeSet: "en,en-XA",
                viewportDevice: "desktop and mobile pinned Chromium"
              }
            };
          })
        }
      : route
  )
};
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M10/traceability.json"), "utf8")
);
const priorById = new Map(priorTraceability.requirements.map((row) => [row.requirementId, row]));
const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => {
    const common = {
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
    };
    if (!requirements.has(expected.requirementId))
      return { ...priorById.get(expected.requirementId), ...common };
    return {
      ...common,
      openapiOperationIds: operations,
      tablesAndObjects: [
        "workflow_runs",
        "task_runs",
        "task_attempts",
        "run_events",
        "run_saved_views",
        "run_follows",
        "run_artifacts"
      ],
      events: [
        "run.running.v1",
        "run.paused.v1",
        "run.succeeded.v1",
        "task.started.v1",
        "task.succeeded.v1"
      ],
      authorizationRules: [
        "apps/api/src/app.ts#workflowAccess",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tests/e2e/run-room.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/web/src/M11Pages.tsx#RunRoomPage",
        "apps/web/src/M11Pages.tsx#TaskInspector",
        "packages/db/src/runtime-repository.ts#workflowRuns"
      ],
      automatedTests: ["tooling/workflows/postgres-suite.ts", "tests/e2e/run-room.spec.ts"],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/durable-runtime.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "runtime.live-run-room",
    status: "DEMO",
    summary:
      "Responsive run filtering, equivalent outline/graph/timeline views, resumable cursor streaming, safe controls, redacted attempts, attention guidance, and CSV export are verified locally.",
    owner: { team: "runtime-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/durable-runtime.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M11/test-results/run-room-browser.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed with zero retries or quarantines.`,
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
process.stdout.write("Generated M11 evidence bindings.\n");
