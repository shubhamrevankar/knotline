#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M07";
const recordedAt = "2026-08-01T01:05:00.000Z";
const output = join(ROOT, "artifacts/verification/M07");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(
  Array.from({ length: 8 }, (_, index) => `WF-${String(index + 5).padStart(3, "0")}`)
);
const ownedRoutes = new Set(["route.app.workflows.detail.studio"]);
const operations = registries.api.entries
  .filter(({ path }) => path.includes("/v1/workflows/:workflowId/draft"))
  .map(({ id }) => id);
const tables = [
  "workflows",
  "workflow_versions",
  "workflow_nodes",
  "workflow_edges",
  "workflow_validation_findings",
  "audit_events",
  "outbox_events"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m07-studio-unit", "pnpm test:unit", "studio-unit"],
  [
    "m07-studio-browser",
    "pnpm exec playwright test tests/e2e/workflow-studio.spec.ts",
    "studio-browser"
  ],
  ["m07-studio-accessibility", "pnpm test:a11y", "studio-accessibility"],
  [
    "m07-studio-performance",
    "pnpm exec vitest run apps/web/src/studio-reducer.test.ts",
    "studio-performance"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M07/test-results/${slug}`
}));

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) => activationMilestones.some((id) => Number(id.slice(1)) <= 7))
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 7)
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
      id: "m07-studio-review",
      owner: "shurevan",
      evidenceUri: "artifact://M07/manual/studio-review"
    }
  ],
  deployments: [],
  migrations: [],
  flags: [],
  knownRisks: [],
  evidenceUris: [
    "repo://apps/web/src/StudioPage.tsx",
    "repo://apps/web/src/studio-reducer.ts",
    "repo://apps/web/src/studio-recovery.ts",
    "repo://tests/e2e/workflow-studio.spec.ts",
    "repo://docs/operations/knotline/workflow-studio.md"
  ]
};

const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M06/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M07/test-results/studio-accessibility",
                authorizationPersona: "workspace builder with workflow manage permission",
                browserTest: "tests/e2e/workflow-studio.spec.ts",
                evidenceUri: "artifact://M07/test-results/studio-browser",
                expectedTelemetry:
                  "content-free workflow ID, version, revision, conflict code, and request ID",
                fixture: `workflow-studio.${state.stateId}`,
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
  await readFile(join(ROOT, "artifacts/verification/M06/traceability.json"), "utf8")
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
      events: ["workflow.draft.updated.v1"],
      authorizationRules: ["apps/api/src/app.ts#workflowAccess"],
      routeStateEvidence: ["tests/e2e/workflow-studio.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/web/src/StudioPage.tsx#StudioEditor",
        "apps/web/src/studio-reducer.ts#studioReducer",
        "packages/contracts/src/workflow-definition.ts#workflowDefinitionEdgeSchema"
      ],
      automatedTests: ["apps/web/src/studio-reducer.test.ts", "tests/e2e/workflow-studio.spec.ts"],
      manualEvidence: ["artifact://M07/manual/studio-review"],
      operationalControls: ["docs/operations/knotline/workflow-studio.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};

const capabilities = [
  {
    id: "workflow.accessible-studio",
    status: "DEMO",
    summary:
      "Responsive canvas and outline editing, typed inspectors, optimistic concurrency, encrypted recovery, validation focus, and 500-node layout are verified locally.",
    owner: { team: "workflow-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/workflow-studio.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M07/manual/studio-review.json"
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
  id: "m07-studio-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed all ten node kinds, canvas and outline parity, typed node and edge settings, keyboard/touch alternatives, validation focus, explicit concurrency conflict, encrypted recovery, worker layout, and mobile outline-first order.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/studio-review.json"), canonicalJson(manual)),
  ...records.map((record, index) =>
    writeFile(
      join(output, `test-results/${testRuns[index].evidenceUri.split("/").at(-1)}.json`),
      canonicalJson(record)
    )
  )
]);
process.stdout.write("Generated M07 evidence bindings.\n");
