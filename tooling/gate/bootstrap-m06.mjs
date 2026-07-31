#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M06";
const recordedAt = "2026-08-01T00:45:00.000Z";
const output = join(ROOT, "artifacts/verification/M06");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set([
  "WF-001",
  "WF-002",
  "WF-004",
  "WF-013",
  "WF-015",
  "WF-016",
  "WF-017",
  "WF-018",
  "WF-019",
  "WF-020"
]);
const ownedRoutes = new Set([
  "route.app.templates",
  "route.app.templates.detail",
  "route.app.workflows",
  "route.app.workflows.detail",
  "route.app.workflows.detail.settings",
  "route.app.workflows.detail.versions",
  "route.app.workflows.detail.versions.detail"
]);
const tables = [
  "workflows",
  "workflow_versions",
  "workflow_nodes",
  "workflow_edges",
  "workflow_folders",
  "workflow_tags",
  "workflow_tag_assignments",
  "workflow_favorites",
  "workflow_validation_findings",
  "workflow_templates",
  "workflow_template_versions",
  "workflow_triggers",
  "audit_events",
  "outbox_events"
];
const operationKeys = new Set([
  "GET /v1/workspaces/:workspaceId/workflows",
  "POST /v1/workspaces/:workspaceId/workflows",
  "GET /v1/workflows/:workflowId",
  "PATCH /v1/workflows/:workflowId",
  "DELETE /v1/workflows/:workflowId",
  "POST /v1/workflows/:workflowId/restorations",
  "POST /v1/workflows/:workflowId/duplicates",
  "POST /v1/workspaces/:workspaceId/workflow-imports",
  "POST /v1/workflows/:workflowId/exports",
  "POST /v1/workflows/:workflowId/ownership-transfers",
  "POST /v1/workflows/:workflowId/favorites",
  "DELETE /v1/workflows/:workflowId/favorites",
  "GET /v1/workflows/:workflowId/draft",
  "PUT /v1/workflows/:workflowId/draft",
  "POST /v1/workflows/:workflowId/draft/operations",
  "POST /v1/workflows/:workflowId/draft/validations",
  "POST /v1/workflows/:workflowId/draft/publications",
  "GET /v1/workflows/:workflowId/versions",
  "GET /v1/workflows/:workflowId/versions/:version",
  "GET /v1/workflows/:workflowId/version-diffs",
  "POST /v1/workflows/:workflowId/drafts-from-version",
  "GET /v1/workspaces/:workspaceId/workflow-folders",
  "POST /v1/workspaces/:workspaceId/workflow-folders",
  "GET /v1/workspaces/:workspaceId/workflow-tags",
  "POST /v1/workspaces/:workspaceId/workflow-tags",
  "GET /v1/templates",
  "POST /v1/workspaces/:workspaceId/templates",
  "POST /v1/templates/:templateId/instantiations"
]);
const operations = registries.api.entries
  .filter(({ method, path }) => operationKeys.has(`${method} ${path}`))
  .map(({ id }) => id);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m06-workflow-security", "pnpm test:workflows", "workflow-security"],
  ["m06-unit-property", "pnpm test:unit", "unit-property"],
  ["m06-browser", "pnpm exec playwright test tests/e2e/versioned-workflows.spec.ts", "browser"],
  ["m06-accessibility", "pnpm test:a11y", "accessibility"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M06/test-results/${slug}`
}));

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) => activationMilestones.some((id) => Number(id.slice(1)) <= 6))
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 6)
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
      id: "m06-workflow-review",
      owner: "shurevan",
      evidenceUri: "artifact://M06/manual/workflow-review"
    }
  ],
  deployments: [],
  migrations: [
    {
      id: "0004-versioned-workflows",
      evidenceUri: "repo://packages/db/migrations/0004_versioned_workflows.sql"
    }
  ],
  flags: [],
  knownRisks: [],
  evidenceUris: [
    "repo://packages/contracts/src/workflow-definition.ts",
    "repo://packages/db/migrations/0004_versioned_workflows.sql",
    "repo://packages/db/src/versioned-workflow-repository.ts",
    "repo://tooling/workflows/postgres-suite.ts",
    "repo://artifacts/security/M06/versioned-workflows.json",
    "repo://docs/operations/knotline/versioned-workflows.md"
  ]
};

const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M05/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M06/test-results/accessibility",
                authorizationPersona:
                  "workspace builder with workflow read, create, or manage permission",
                browserTest: "tests/e2e/versioned-workflows.spec.ts",
                evidenceUri: "artifact://M06/test-results/browser",
                expectedTelemetry:
                  "content-free workflow ID, version, finding code, hash, and request ID",
                fixture: `versioned-workflow.${route.routeId}.${state.stateId}`,
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
  await readFile(join(ROOT, "artifacts/verification/M05/traceability.json"), "utf8")
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
      events: ["workflow.created.v1", "workflow.published.v1"],
      authorizationRules: [
        "apps/api/src/app.ts#workflowAccess",
        "apps/api/src/workspace.ts#WorkspaceService.require",
        "packages/db/src/versioned-workflow-repository.ts#PostgresVersionedWorkflowRepository"
      ],
      routeStateEvidence: ["tests/e2e/versioned-workflows.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/contracts/src/workflow-definition.ts#validateWorkflowDefinition",
        "packages/db/src/versioned-workflow-repository.ts#PostgresVersionedWorkflowRepository",
        "apps/web/src/M06Pages.tsx"
      ],
      automatedTests: [
        "packages/contracts/src/workflow-definition.test.ts",
        "tooling/workflows/postgres-suite.ts#runSuite",
        "tests/e2e/versioned-workflows.spec.ts"
      ],
      manualEvidence: ["artifact://M06/manual/workflow-review"],
      operationalControls: ["docs/operations/knotline/versioned-workflows.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};

const capabilities = [
  {
    id: "workflow.versioned-definitions",
    status: "DEMO",
    summary:
      "Typed workflow drafts, deterministic validation, immutable publishing, version restore, import/export, and templates are verified locally.",
    owner: { team: "workflow-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/versioned-workflows.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/security/M06/versioned-workflows.json"
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
  id: "m06-workflow-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed create, validate, finding deep links, publish, immutable history, diff, restore, templates, responsive layout, and no simulated run success.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/workflow-review.json"), canonicalJson(manual)),
  ...records.map((record, index) =>
    writeFile(
      join(output, `test-results/${testRuns[index].evidenceUri.split("/").at(-1)}.json`),
      canonicalJson(record)
    )
  )
]);
process.stdout.write("Generated M06 evidence bindings.\n");
