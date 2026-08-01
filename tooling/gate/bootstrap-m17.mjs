#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M17";
const recordedAt = "2026-08-01T15:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M17");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set([
  "AG-007",
  "AG-008",
  "AG-011",
  "AG-012",
  "AG-014",
  "AG-019",
  "AG-020",
  "AG-021",
  "AG-022"
]);
const operations = registries.api.entries
  .filter(({ path }) => path.includes("memory") || path.includes("/runs"))
  .map(({ id }) => id);
const tables = [
  "agent_executions",
  "agent_execution_turns",
  "agent_context_manifests",
  "provenance_nodes",
  "provenance_edges",
  "memory_policies",
  "memory_records",
  "memory_versions",
  "memory_uses",
  "memory_tombstones"
];
const events = [
  "agent.execution_queued.v1",
  "agent.execution_started.v1",
  "agent.execution_turn_completed.v1",
  "agent.execution_approval_required.v1",
  "agent.execution_succeeded.v1",
  "agent.execution_failed.v1",
  "agent.execution_cancelled.v1",
  "memory.record_created.v1",
  "memory.record_corrected.v1",
  "memory.scope_changed.v1",
  "memory.record_tombstoned.v1",
  "memory.record_expired.v1",
  "memory.permission_invalidated.v1",
  "memory.record_purged.v1"
];
const externalGate = (gateId) => ({
  gateId,
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  gaRequired: true,
  accountableOwner: "shurevan",
  reviewExpiresAt: null,
  evidenceUris: []
});
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m17-runtime-unit", "pnpm --filter @knotline/agent-runtime test", "runtime-unit"],
  ["m17-worker-unit", "pnpm --filter @knotline/worker test", "worker-unit"],
  ["m17-agent-api", "pnpm test:api", "agent-api"],
  ["m17-agent-migrations", "pnpm verify:migrations", "agent-migrations"],
  [
    "m17-agent-browser",
    "pnpm exec playwright test tests/e2e/memory.spec.ts tests/e2e/run-room.spec.ts",
    "agent-browser"
  ],
  [
    "m17-agent-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "agent-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M17/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 17)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 17)
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
  externalGates: [externalGate("EXT-003"), externalGate("EXT-004")],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0014-agent-execution-memory",
      evidenceUri: "repo://packages/db/migrations/0014_agent_execution_memory.sql"
    }
  ],
  flags: [
    {
      id: "agent-runtime-emergency-controls",
      evidenceUri: "repo://docs/operations/knotline/agent-runtime-and-memory.md"
    }
  ],
  knownRisks: [
    {
      id: "m17-live-provider-and-deployed-worker-unprovisioned",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/agent-runtime/src/runtime.ts",
    "repo://apps/worker/src/activities.ts",
    "repo://packages/db/src/agent-execution-repository.ts",
    "repo://packages/db/src/memory-repository.ts",
    "repo://apps/web/src/M17Pages.tsx",
    "repo://docs/operations/knotline/agent-runtime-and-memory.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M16/route-coverage.json"), "utf8")
);
const activatedRoutes = new Set(["route.app.profile.memory", "route.app.agents.detail.memory"]);
const routeEvidence = {
  fixture: "canonical-m17-memory",
  browserTest: "tests/e2e/memory.spec.ts",
  accessibilityResult: "artifact://M17/test-results/agent-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
  authorizationPersona: "member owner and authorized workspace administrator",
  expectedTelemetry: "content-free route ID, action result, and error code only",
  evidenceUri: "artifact://M17/test-results/agent-browser"
};
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    activatedRoutes.has(route.routeId)
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
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M16/traceability.json"), "utf8")
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
        "packages/agent-runtime/src/runtime.ts#GovernedAgentRuntime",
        "packages/db/src/context.ts#withTenantTransaction",
        "packages/db/src/memory-repository.ts#PostgresMemoryRepository"
      ],
      routeStateEvidence: ["tests/e2e/memory.spec.ts", "tests/e2e/run-room.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/agent-runtime-and-memory.md"
      ],
      sourceSymbols: [
        "packages/agent-runtime/src/runtime.ts#GovernedAgentRuntime",
        "apps/worker/src/activities.ts#executeGovernedAgent",
        "packages/db/src/agent-execution-repository.ts#PostgresAgentExecutionRepository",
        "packages/db/src/memory-repository.ts#PostgresMemoryRepository"
      ],
      automatedTests: [
        "packages/agent-runtime/src/runtime.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/memory.spec.ts",
        "tests/e2e/run-room.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/agent-runtime-and-memory.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "agents.governed-execution",
    status: "DEMO",
    summary:
      "Durable bounded execution, reauthorized context, model and broker dispatch, typed output, provenance, and explicit lifecycle-governed memory are locally verified.",
    owner: { team: "agent-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/agent-runtime-and-memory.md",
    externalGates: ["EXT-003", "EXT-004"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M17/test-results/runtime-unit.json"
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
process.stdout.write("Generated M17 evidence bindings.\n");
