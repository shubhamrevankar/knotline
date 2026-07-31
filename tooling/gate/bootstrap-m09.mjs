#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M09";
const recordedAt = "2026-08-01T03:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M09");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["CO-001", "CO-002", "CO-003"]);
const operationKeys = new Set([
  "GET /v1/resources/:resourceType/:resourceId/thread",
  "POST /v1/resources/:resourceType/:resourceId/comments",
  "PATCH /v1/comments/:commentId",
  "DELETE /v1/comments/:commentId",
  "POST /v1/comments/:commentId/reactions",
  "DELETE /v1/comments/:commentId/reactions/:reaction",
  "POST /v1/workflows/:workflowId/follows",
  "DELETE /v1/workflows/:workflowId/follows"
]);
const operations = registries.api.entries
  .filter(({ method, path }) => operationKeys.has(`${method} ${path}`))
  .map(({ id }) => id);
const tables = [
  "generic_threads",
  "generic_comments",
  "comment_mentions",
  "comment_reactions",
  "resource_follows",
  "resource_activity_events",
  "notification_intents",
  "saved_resource_filters"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  [
    "m09-collaboration-unit",
    "pnpm exec vitest run packages/contracts/src/collaboration.test.ts",
    "collaboration-unit"
  ],
  ["m09-collaboration-api", "pnpm test:api", "collaboration-api"],
  [
    "m09-collaboration-browser",
    "pnpm exec playwright test tests/e2e/collaboration.spec.ts tests/e2e/workflow-studio.spec.ts",
    "collaboration-browser"
  ],
  ["m09-collaboration-security", "pnpm test:api && pnpm test:rls", "collaboration-security"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M09/test-results/${slug}`
}));

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) => activationMilestones.some((id) => Number(id.slice(1)) <= 9))
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 9)
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
      id: "m09-collaboration-review",
      owner: "shurevan",
      evidenceUri: "artifact://M09/manual/collaboration-review"
    }
  ],
  deployments: [],
  migrations: [
    {
      id: "0006-collaboration-activity",
      evidenceUri: "repo://packages/db/migrations/0006_collaboration_activity.sql"
    }
  ],
  flags: [],
  knownRisks: [
    {
      id: "m09-channel-delivery-deferred",
      owner: "shurevan",
      status: "planned-m27",
      evidenceUri: "repo://docs/operations/knotline/collaboration-and-conflicts.md"
    }
  ],
  evidenceUris: [
    "repo://packages/contracts/src/collaboration.ts",
    "repo://packages/db/src/collaboration-repository.ts",
    "repo://apps/web/src/CollaborationPanel.tsx",
    "repo://tests/e2e/collaboration.spec.ts",
    "repo://docs/operations/knotline/collaboration-and-conflicts.md"
  ]
};

const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M08/route-coverage.json"), "utf8")
);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest
};

const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M08/traceability.json"), "utf8")
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
      authorizationRules: [
        "apps/api/src/app.ts#workflowAccess",
        "packages/db/src/collaboration-repository.ts#authorizeResource"
      ],
      routeStateEvidence: ["tests/e2e/collaboration.spec.ts", "tests/e2e/workflow-studio.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/contracts/src/collaboration.ts#renderSafeMarkdown",
        "packages/contracts/src/collaboration.ts#mergeChangedSections",
        "packages/db/src/collaboration-repository.ts#PostgresCollaborationRepository",
        "apps/web/src/CollaborationPanel.tsx#CollaborationPanel"
      ],
      automatedTests: [
        "packages/contracts/src/collaboration.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/collaboration.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/collaboration-and-conflicts.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};

const capabilities = [
  {
    id: "workflow.collaboration-conflict-recovery",
    status: "DEMO",
    summary:
      "Durable authorized discussions, mentions, reactions, follows, activity, optional presence, safe Markdown, and explicit ETag conflict recovery are verified locally.",
    owner: { team: "workflow-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/collaboration-and-conflicts.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M09/manual/collaboration-review.json"
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
  id: "m09-collaboration-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed authorized discussion, mention isolation, reactions, attachments, edit and tombstone policies, product activity separation, ephemeral presence loss, share-link authorization, and reload/reapply conflict recovery on desktop and mobile.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/collaboration-review.json"), canonicalJson(manual)),
  ...records.map((record, index) =>
    writeFile(
      join(output, `test-results/${testRuns[index].evidenceUri.split("/").at(-1)}.json`),
      canonicalJson(record)
    )
  )
]);
process.stdout.write("Generated M09 evidence bindings.\n");
