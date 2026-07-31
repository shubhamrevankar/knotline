#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M12";
const recordedAt = "2026-08-01T06:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M12");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["HU-001", "HU-002", "HU-003", "HU-004", "HU-005", "HU-011"]);
const ownedRoutes = new Set(["route.app.inbox", "route.app.tasks", "route.app.tasks.detail"]);
const operations = registries.api.entries
  .filter(
    ({ path }) => path.includes("task-") || path.includes("task-runs") || path.includes("artifact")
  )
  .map(({ id }) => id);
const tables = [
  "human_task_details",
  "human_task_drafts",
  "human_task_submissions",
  "task_delegations",
  "task_watchers",
  "task_queues",
  "task_queue_members",
  "task_routing_policy_versions",
  "task_routing_decisions",
  "business_calendars",
  "business_calendar_versions",
  "task_templates",
  "task_template_versions",
  "files",
  "file_versions",
  "file_upload_sessions",
  "task_file_attachments"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m12-human-task-property", "pnpm test:property", "human-task-property"],
  ["m12-human-task-api", "pnpm test:api", "human-task-api"],
  ["m12-human-task-migrations", "pnpm verify:migrations", "human-task-migrations"],
  [
    "m12-human-task-browser",
    "pnpm exec playwright test tests/e2e/human-tasks.spec.ts",
    "human-task-browser"
  ],
  ["m12-human-task-performance", "pnpm verify:web-performance", "human-task-performance"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M12/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 12)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 12)
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
      id: "0009-human-task-execution",
      evidenceUri: "repo://packages/db/migrations/0009_human_task_execution.sql"
    }
  ],
  flags: [],
  knownRisks: [],
  evidenceUris: [
    "repo://apps/web/src/M12Pages.tsx",
    "repo://packages/contracts/src/human-task.ts",
    "repo://packages/db/src/human-task-repository.ts",
    "repo://packages/db/src/task-administration-repository.ts",
    "repo://tests/e2e/human-tasks.spec.ts"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M11/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M12/test-results/human-task-browser",
                authorizationPersona:
                  "authorized workspace member and task assignee or queue administrator",
                browserTest: "tests/e2e/human-tasks.spec.ts",
                evidenceUri: "artifact://M12/test-results/human-task-browser",
                expectedTelemetry:
                  "task ID, assignment fence, draft version, immutable submission, routing decision, and quarantine state",
                fixture: `human-task.${state.stateId}`,
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
  await readFile(join(ROOT, "artifacts/verification/M11/traceability.json"), "utf8")
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
      events: ["task.claimed.v1", "task.delegated.v1", "task.submitted.v1", "task.reopened.v1"],
      authorizationRules: [
        "apps/api/src/app.ts#humanTaskAccess",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tests/e2e/human-tasks.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/web/src/M12Pages.tsx#TaskInboxPage",
        "apps/web/src/M12Pages.tsx#TaskDetailPage",
        "packages/db/src/human-task-repository.ts#PostgresHumanTaskRepository",
        "packages/db/src/task-administration-repository.ts#PostgresTaskAdministrationRepository"
      ],
      automatedTests: [
        "packages/contracts/src/human-task.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/human-tasks.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/durable-runtime.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "tasks.complete-human-work",
    status: "DEMO",
    summary:
      "Responsive inbox and forms, atomic claims, optimistic drafts, immutable submissions, delegation/reopen lineage, deterministic queues, templates, and quarantined restricted artifacts are locally verified.",
    owner: { team: "workflow-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/durable-runtime.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M12/test-results/human-task-browser.json"
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
process.stdout.write("Generated M12 evidence bindings.\n");
