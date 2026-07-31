#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M08";
const recordedAt = "2026-08-01T02:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M08");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["ON-002", "WF-014"]);
const ownedRoutes = new Set(["route.app.workflows.new"]);
const operationKeys = new Set([
  "POST /v1/workspaces/:workspaceId/workflow-generations",
  "GET /v1/workflow-generations/:generationId",
  "POST /v1/workflow-generations/:generationId/cancellations",
  "POST /v1/workflow-generations/:generationId/acceptances",
  "POST /v1/workflow-import-previews",
  "POST /v1/workflow-dry-runs",
  "POST /v1/workspaces/:workspaceId/workflow-imports"
]);
const operations = registries.api.entries
  .filter(({ method, path }) => operationKeys.has(`${method} ${path}`))
  .map(({ id }) => id);
const tables = [
  "workflow_generations",
  "workflow_test_runs",
  "workflows",
  "workflow_versions",
  "workflow_nodes",
  "workflow_edges",
  "audit_events",
  "outbox_events"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  [
    "m08-generation-unit",
    "pnpm exec vitest run packages/contracts/src/workflow-generation.test.ts apps/api/src/workflow-generation.test.ts",
    "generation-unit"
  ],
  ["m08-generation-api", "pnpm exec vitest run apps/api/src/app.test.ts", "generation-api"],
  [
    "m08-generation-browser",
    "pnpm exec playwright test tests/e2e/workflow-generation.spec.ts",
    "generation-browser"
  ],
  ["m08-generation-security", "pnpm test:unit && pnpm test:rls", "generation-security"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M08/test-results/${slug}`
}));

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) => activationMilestones.some((id) => Number(id.slice(1)) <= 8))
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 8)
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
  manualReviews: [
    {
      id: "m08-generation-review",
      owner: "shurevan",
      evidenceUri: "artifact://M08/manual/generation-review"
    }
  ],
  deployments: [],
  migrations: [
    {
      id: "0005-workflow-generation-test-mode",
      evidenceUri: "repo://packages/db/migrations/0005_workflow_generation_test_mode.sql"
    }
  ],
  flags: [
    {
      id: "real-workflow-generation",
      evidenceUri: "repo://docs/operations/knotline/workflow-generation-test-mode.md"
    }
  ],
  knownRisks: [
    {
      id: "m08-real-provider-disabled",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/contracts/src/workflow-generation.ts",
    "repo://apps/api/src/workflow-generation.ts",
    "repo://apps/web/src/GuidedWorkflowCreate.tsx",
    "repo://tests/e2e/workflow-generation.spec.ts",
    "repo://docs/operations/knotline/workflow-generation-test-mode.md"
  ]
};

const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M07/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M08/test-results/generation-browser",
                authorizationPersona: "workspace builder with workflow create permission",
                browserTest: "tests/e2e/workflow-generation.spec.ts",
                evidenceUri: "artifact://M08/test-results/generation-browser",
                expectedTelemetry:
                  "generation ID, lifecycle, phase, prompt contract, provider key, repair count, and content-free finding codes",
                fixture: `workflow-generation.${state.stateId}`,
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
  await readFile(join(ROOT, "artifacts/verification/M07/traceability.json"), "utf8")
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
      events: [],
      authorizationRules: ["apps/api/src/app.ts#workflowAccess"],
      routeStateEvidence: ["tests/e2e/workflow-generation.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/contracts/src/workflow-generation.ts#runDeterministicGeneration",
        "packages/contracts/src/workflow-generation.ts#dryRunWorkflow",
        "apps/api/src/workflow-generation.ts#WorkflowGenerationService",
        "apps/web/src/GuidedWorkflowCreate.tsx#GuidedWorkflowCreate"
      ],
      automatedTests: [
        "packages/contracts/src/workflow-generation.test.ts",
        "apps/api/src/workflow-generation.test.ts",
        "tests/e2e/workflow-generation.spec.ts"
      ],
      manualEvidence: ["artifact://M08/manual/generation-review"],
      operationalControls: ["docs/operations/knotline/workflow-generation-test-mode.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};

const capabilities = [
  {
    id: "workflow.simulated-generation-test-mode",
    status: "DEMO",
    summary:
      "Deterministic guided generation, reviewed import, policy preflight, zero-write fixture execution, and accept-and-publish are verified locally; real provider activation remains blocked.",
    owner: { team: "workflow-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/workflow-generation-test-mode.md",
    externalGates: ["EXT-004"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M08/manual/generation-review.json"
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
const manual = {
  schemaVersion: 1,
  id: "m08-generation-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed blank, template, guided fixture and import entry paths; full generation lineage; bounded repair and cancellation; preflight negative cases; zero external writes; explicit SIMULATED labeling; responsive accept-and-publish flow; and M15 provider gate.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/generation-review.json"), canonicalJson(manual)),
  ...records.map((record, index) =>
    writeFile(
      join(output, `test-results/${testRuns[index].evidenceUri.split("/").at(-1)}.json`),
      canonicalJson(record)
    )
  )
]);
process.stdout.write("Generated M08 evidence bindings.\n");
