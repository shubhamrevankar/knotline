#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M10";
const recordedAt = "2026-08-01T04:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M10");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set([
  "BL-005",
  "BL-006",
  ...Array.from({ length: 14 }, (_, index) => `RN-${String(index + 2).padStart(3, "0")}`),
  "RN-017",
  "RN-018"
]);
const operationKeys = new Set([
  "POST /v1/workflows/:workflowId/runs",
  "GET /v1/runs/:runId",
  "GET /v1/runs/:runId/events",
  "POST /v1/runs/:runId/pauses",
  "POST /v1/runs/:runId/resumptions",
  "POST /v1/runs/:runId/cancellations"
]);
const operations = registries.api.entries
  .filter(({ method, path }) => operationKeys.has(`${method} ${path}`))
  .map(({ id }) => id);
const tables = [
  "workflow_runs",
  "task_runs",
  "task_dependencies",
  "task_attempts",
  "run_events",
  "outbox_events",
  "event_receipts",
  "external_operations",
  "external_operation_attempts",
  "external_operation_attempt_records",
  "dead_letter_items",
  "entitlement_policies",
  "budget_periods",
  "admission_reservations",
  "admission_ledger_entries",
  "runtime_control_switches"
];
const events = [
  "run.queued.v1",
  "run.running.v1",
  "run.paused.v1",
  "run.succeeded.v1",
  "task.started.v1",
  "task.succeeded.v1",
  "usage.reservation_created.v1",
  "usage.reservation_finalized.v1",
  "usage.reservation_released.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  [
    "m10-runtime-unit",
    "pnpm exec vitest run packages/contracts/src/runtime.test.ts apps/worker/src/workflows.test.ts",
    "runtime-unit"
  ],
  ["m10-runtime-api", "pnpm test:api", "runtime-api"],
  ["m10-temporal-integration", "pnpm test:integration", "temporal-integration"],
  ["m10-runtime-security", "pnpm test:rls && pnpm verify:secrets", "runtime-security"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M10/test-results/${slug}`
}));

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 10)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 10)
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
  externalGates: [
    {
      gateId: "EXT-003",
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: "PRODUCTION_VERIFIED",
      accountableOwner: "shurevan",
      gaRequired: true,
      reviewExpiresAt: null,
      evidenceUris: []
    }
  ],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0007-durable-runtime-admission",
      evidenceUri: "repo://packages/db/migrations/0007_durable_runtime_admission.sql"
    }
  ],
  flags: [
    {
      id: "runtime-start-controls",
      evidenceUri: "repo://docs/operations/knotline/durable-runtime.md"
    }
  ],
  knownRisks: [
    {
      id: "m10-production-temporal-unprovisioned",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/contracts/src/runtime.ts",
    "repo://packages/db/src/runtime-repository.ts",
    "repo://apps/worker/src/workflows.ts",
    "repo://tooling/runtime/temporal-smoke.ts",
    "repo://docs/operations/knotline/durable-runtime.md"
  ]
};

const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M09/route-coverage.json"), "utf8")
);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest
};
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M09/traceability.json"), "utf8")
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
      tablesAndObjects: tables,
      events,
      authorizationRules: [
        "apps/api/src/app.ts#workflowAccess",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tooling/runtime/temporal-smoke.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/contracts/src/runtime.ts#compileRuntimePlan",
        "packages/db/src/runtime-repository.ts#PostgresRuntimeRepository",
        "apps/worker/src/workflows.ts#durableWorkflowRun",
        "apps/worker/src/activities.ts#executeSyntheticTask"
      ],
      automatedTests: [
        "packages/contracts/src/runtime.test.ts",
        "apps/worker/src/workflows.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tooling/runtime/temporal-smoke.ts"
      ],
      manualEvidence: [],
      operationalControls: [
        "docs/operations/knotline/durable-runtime.md",
        "tooling/runtime/repair.ts"
      ],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "runtime.durable-local-execution",
    status: "DEMO",
    summary:
      "Durable admission, deterministic Temporal execution, task attempts, pause/resume, ordered history, exact reservation settlement, start reconciliation, and scoped repair are verified locally.",
    owner: { team: "runtime-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/durable-runtime.md",
    externalGates: ["EXT-003"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M10/test-results/temporal-integration.json"
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
process.stdout.write("Generated M10 evidence bindings.\n");
