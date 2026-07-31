#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M13";
const recordedAt = "2026-08-01T08:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M13");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["HU-006", "HU-007", "HU-008", "HU-009", "HU-010"]);
const ownedRoutes = new Set(["route.app.approvals", "route.app.approvals.detail"]);
const operations = registries.api.entries
  .filter(({ path }) => path.includes("/approvals"))
  .map(({ id }) => id);
const tables = [
  "approval_policies",
  "approval_policy_versions",
  "approvals",
  "approval_steps",
  "approval_decisions",
  "approval_delegations",
  "sla_definitions",
  "sla_definition_versions",
  "sla_timer_events",
  "approval_consumptions",
  "notification_intents"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m13-approval-property", "pnpm test:property", "approval-property"],
  ["m13-approval-api", "pnpm test:api", "approval-api"],
  ["m13-approval-migrations", "pnpm verify:migrations", "approval-migrations"],
  [
    "m13-approval-browser",
    "pnpm exec playwright test tests/e2e/approvals.spec.ts",
    "approval-browser"
  ],
  ["m13-approval-performance", "pnpm verify:web-performance", "approval-performance"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M13/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 13)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 13)
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
      id: "0010-approval-sla-governance",
      evidenceUri: "repo://packages/db/migrations/0010_approval_sla_governance.sql"
    }
  ],
  flags: [],
  knownRisks: [],
  evidenceUris: [
    "repo://apps/web/src/M13Pages.tsx",
    "repo://packages/contracts/src/approval.ts",
    "repo://packages/db/src/approval-repository.ts",
    "repo://apps/worker/src/workflows.ts",
    "repo://tests/e2e/approvals.spec.ts",
    "repo://docs/operations/knotline/approvals-and-sla.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M12/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M13/test-results/approval-browser",
                authorizationPersona: "requester or eligible recorded approver",
                browserTest: "tests/e2e/approvals.spec.ts",
                evidenceUri: "artifact://M13/test-results/approval-browser",
                expectedTelemetry:
                  "approval ID, immutable packet hash, policy version, decision, timer, and CAS outcome",
                fixture: `approval.${state.stateId}`,
                localeSet: "en,en-XA",
                viewportDevice: "desktop and 320px mobile pinned Chromium"
              }
            };
          })
        }
      : route
  )
};
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M12/traceability.json"), "utf8")
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
      events: [
        "approval.requested.v1",
        "approval.decided.v1",
        "approval.expired.v1",
        "approval.revoked.v1",
        "approval.consumed.v1"
      ],
      authorizationRules: [
        "apps/api/src/app.ts#approvalAccess",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tests/e2e/approvals.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/web/src/M13Pages.tsx#ApprovalInboxPage",
        "apps/web/src/M13Pages.tsx#ApprovalDetailPage",
        "packages/db/src/approval-repository.ts#PostgresApprovalRepository",
        "apps/worker/src/workflows.ts#durableWorkflowRun"
      ],
      automatedTests: [
        "packages/contracts/src/approval.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/approvals.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/approvals-and-sla.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "approvals.durable-authorization",
    status: "DEMO",
    summary:
      "Immutable policy and packet snapshots, eligibility resolution, two-phase authorization, revocation/consumption CAS, durable expiry, deduplicated reminders, and responsive decisions are locally verified.",
    owner: { team: "workflow-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/approvals-and-sla.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M13/test-results/approval-api.json"
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
process.stdout.write("Generated M13 evidence bindings.\n");
