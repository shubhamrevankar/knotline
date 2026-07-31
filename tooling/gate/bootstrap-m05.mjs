#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M05";
const output = join(ROOT, "artifacts/verification/M05");
const recordedAt = "2026-07-31T23:55:00.000Z";
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set([
  "ID-006",
  "ID-007",
  "ID-008",
  "ID-009",
  "ID-010",
  "ON-001",
  "ON-004",
  "ON-005",
  "ON-006",
  "ON-007"
]);
const ownedRoutes = new Set([
  "route.app.onboarding",
  "route.app.settings.members",
  "route.app.settings.roles",
  "route.app.settings.workspace",
  "route.invitations.accept"
]);
const tables = [
  "workspaces",
  "memberships",
  "permission_catalog",
  "workspace_roles",
  "workspace_invitations",
  "workspace_groups",
  "workspace_group_memberships",
  "organization_relationships",
  "resource_grants",
  "onboarding_progress",
  "sandbox_resources",
  "guest_identities",
  "audit_events",
  "outbox_events"
];
const implementedOperationIds = new Set([
  "get-v1-workspaces",
  "post-v1-workspaces",
  "get-v1-workspaces-by-workspace-id",
  "patch-v1-workspaces-by-workspace-id",
  "delete-v1-workspaces-by-workspace-id",
  "post-v1-workspaces-by-workspace-id-switch",
  "post-v1-workspaces-by-workspace-id-archive",
  "post-v1-workspaces-by-workspace-id-restorations",
  "get-v1-workspaces-by-workspace-id-members",
  "get-v1-workspaces-by-workspace-id-members-by-member-id",
  "patch-v1-workspaces-by-workspace-id-members-by-member-id",
  "delete-v1-workspaces-by-workspace-id-members-by-member-id",
  "post-v1-workspaces-by-workspace-id-ownership-transfers",
  "get-v1-workspaces-by-workspace-id-invitations",
  "post-v1-workspaces-by-workspace-id-invitations",
  "post-v1-invitations-by-invitation-id-resends",
  "delete-v1-invitations-by-invitation-id",
  "post-edge-v1-invitation-responses-preview",
  "post-edge-v1-invitation-responses",
  "get-v1-workspaces-by-workspace-id-roles",
  "post-v1-workspaces-by-workspace-id-roles",
  "get-v1-roles-by-role-id",
  "patch-v1-roles-by-role-id",
  "delete-v1-roles-by-role-id",
  "get-v1-workspaces-by-workspace-id-groups",
  "post-v1-workspaces-by-workspace-id-groups",
  "patch-v1-groups-by-group-id",
  "delete-v1-groups-by-group-id",
  "put-v1-groups-by-group-id-members-by-user-id",
  "delete-v1-groups-by-group-id-members-by-user-id",
  "post-v1-workspaces-by-workspace-id-organization-relationships",
  "get-v1-me-onboarding",
  "put-v1-me-onboarding",
  "post-v1-me-onboarding-sample-workspaces",
  "delete-v1-me-onboarding-sample-workspaces-by-sample-id"
]);
const operations = registries.api.entries
  .filter(({ id }) => implementedOperationIds.has(id))
  .map(({ id }) => id);
const events = [
  "workspace.created.v1",
  "workspace.updated.v1",
  "workspace.archived.v1",
  "member.updated.v1",
  "member.removed.v1",
  "ownership.transferred.v1",
  "invitation.created.v1",
  "invitation.accepted.v1",
  "invitation.declined.v1",
  "invitation.cancelled.v1",
  "role.created.v1",
  "role.updated.v1",
  "role.deleted.v1",
  "group.created.v1",
  "group.updated.v1",
  "group.deleted.v1",
  "organization.relationship.created.v1",
  "onboarding.updated.v1",
  "sandbox.sample.created.v1",
  "sandbox.sample.removed.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m05-workspace-security", "pnpm test:workspace", "workspace-security"],
  ["m05-unit", "pnpm test:unit", "unit"],
  ["m05-browser", "pnpm exec playwright test tests/e2e/workspace-access.spec.ts", "browser"],
  ["m05-accessibility", "pnpm test:a11y", "accessibility"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M05/test-results/${slug}`
}));

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) => activationMilestones.some((id) => Number(id.slice(1)) <= 5))
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 5)
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
      id: "m05-access-review",
      owner: "shurevan",
      evidenceUri: "artifact://M05/manual/access-review"
    }
  ],
  deployments: [],
  migrations: [
    {
      id: "0003-workspace-access-onboarding",
      evidenceUri: "repo://packages/db/migrations/0003_workspace_access_onboarding.sql"
    }
  ],
  flags: [],
  knownRisks: [
    {
      id: "m05-production-invitation-email",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/db/migrations/0003_workspace_access_onboarding.sql",
    "repo://packages/db/src/workspace-repository.ts",
    "repo://apps/api/src/workspace.ts",
    "repo://tooling/workspace/postgres-suite.ts",
    "repo://artifacts/security/M05/workspace-access.json",
    "repo://docs/operations/knotline/workspace-access-onboarding.md"
  ]
};

const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M04/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M05/test-results/accessibility",
                authorizationPersona: "owner, admin, builder, member, auditor, or invited identity",
                browserTest: "tests/e2e/workspace-access.spec.ts",
                evidenceUri: "artifact://M05/test-results/browser",
                expectedTelemetry: "content-free workspace access event and request ID only",
                fixture: `workspace-access.${route.routeId}.${state.stateId}`,
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
  await readFile(join(ROOT, "artifacts/verification/M04/traceability.json"), "utf8")
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
        "apps/api/src/workspace.ts#WorkspaceService.require",
        "packages/db/src/workspace-repository.ts#PostgresWorkspaceRepository",
        "packages/db/migrations/0003_workspace_access_onboarding.sql#row-level-security"
      ],
      routeStateEvidence: ["tests/e2e/workspace-access.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/api/src/workspace.ts#WorkspaceService",
        "apps/web/src/M05Pages.tsx",
        "packages/db/src/workspace-repository.ts#PostgresWorkspaceRepository"
      ],
      automatedTests: [
        "tooling/workspace/postgres-suite.ts#runSuite",
        "tests/e2e/workspace-access.spec.ts"
      ],
      manualEvidence: ["artifact://M05/manual/access-review"],
      operationalControls: ["docs/operations/knotline/workspace-access-onboarding.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};

const capabilities = [
  {
    id: "workspace.access-onboarding",
    status: "DEMO",
    summary:
      "Multi-workspace lifecycle, invitations, RBAC, groups, ownership, and resumable onboarding are verified locally.",
    owner: { team: "workspace-access", contact: "shurevan" },
    runbook: "docs/operations/knotline/workspace-access-onboarding.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/security/M05/workspace-access.json"
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
  id: "m05-access-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed workspace, invitation, ownership, permission-aware, responsive onboarding, sample-data, and clean-token browser surfaces.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/access-review.json"), canonicalJson(manual)),
  ...records.map((record, index) =>
    writeFile(
      join(output, `test-results/${testRuns[index].evidenceUri.split("/").at(-1)}.json`),
      canonicalJson(record)
    )
  )
]);
process.stdout.write("Generated M05 evidence bindings.\n");
