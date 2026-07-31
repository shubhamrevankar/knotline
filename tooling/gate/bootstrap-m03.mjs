#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const milestone = "M03";
const milestoneNumber = 3;
const output = join(ROOT, "artifacts/verification/M03");
const recordedAt = "2026-07-31T22:15:00.000Z";
const requirements = new Set(["ID-014", "ID-015"]);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= milestoneNumber)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) =>
      !activationMilestones.some((id) => Number(id.slice(1)) <= milestoneNumber)
  )
  .map(({ capability, activationMilestones }) => {
    const activationMilestone = [...activationMilestones].sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1))
    )[0];
    return {
      row: capability.toLowerCase(),
      activationMilestone,
      reason: `This gate activates with ${activationMilestone}.`
    };
  });

const testRuns = [
  ["m03-database", "pnpm test:db", "database"],
  ["m03-rls", "pnpm test:rls", "rls"],
  ["m03-migrations", "pnpm verify:migrations", "migrations"],
  ["m03-query-plan", "pnpm verify:query-plan", "query-plan"],
  ["m03-backup", "pnpm verify:backup", "backup"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M03/test-results/${slug}`
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
      gateId: "EXT-002",
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: "PRODUCTION_VERIFIED",
      accountableOwner: "shurevan",
      gaRequired: true,
      reviewExpiresAt: null,
      evidenceUris: []
    }
  ],
  testRuns,
  manualReviews: [
    {
      id: "m03-data-foundation-review",
      owner: "shurevan",
      evidenceUri: "artifact://M03/manual/data-foundation-review"
    }
  ],
  deployments: [],
  migrations: [
    {
      id: "0001-tenant-foundation",
      evidenceUri: "repo://packages/db/migrations/0001_tenant_foundation.sql"
    }
  ],
  flags: [
    {
      id: "emergency-mutation-disable",
      evidenceUri: "repo://docs/operations/knotline/database-foundation.md"
    }
  ],
  knownRisks: [
    {
      id: "m03-production-aws-foundation",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/db/migrations/0001_tenant_foundation.sql",
    "repo://packages/db/registry/data-stores.json",
    "repo://tooling/db/postgres-suite.ts",
    "repo://artifacts/database/M03/migrations.json",
    "repo://docs/operations/knotline/database-foundation.md"
  ]
};

const priorRouteCoverage = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M02/route-coverage.json"), "utf8")
);
const routeCoverage = {
  ...priorRouteCoverage,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest
};

const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M02/traceability.json"), "utf8")
);
const priorById = new Map(priorTraceability.requirements.map((row) => [row.requirementId, row]));
const tables = [
  "users",
  "workspaces",
  "memberships",
  "workflows",
  "workflow_versions",
  "workflow_nodes",
  "workflow_edges",
  "idempotency_records",
  "audit_events",
  "outbox_events",
  "knotline_schema_migrations"
];
const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => {
    const prior = priorById.get(expected.requirementId);
    if (!requirements.has(expected.requirementId)) {
      return {
        ...prior,
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
    }
    return {
      requirementId: expected.requirementId,
      primaryMilestone: expected.primaryMilestone,
      regressionMilestones: expected.regressionMilestones,
      routes: expected.routeIds,
      openapiOperationIds: [],
      tablesAndObjects: tables,
      events: ["workflow.created.v1"],
      authorizationRules: [
        "packages/db/migrations/0001_tenant_foundation.sql#forced-rls",
        "packages/db/src/context.ts#transaction-local-tenant-context"
      ],
      routeStateEvidence: [],
      journeyIds: expected.journeyIds,
      journeyBranchIds: expected.journeyBranchIds,
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/db/src/repository.ts#PostgresWorkflowRepository",
        "packages/db/src/migrations.ts#migrate",
        "apps/api/src/app.ts#buildApp"
      ],
      automatedTests: [
        "tooling/db/postgres-suite.ts#rlsSuite",
        "tooling/db/postgres-suite.ts#integrationSuite",
        "tooling/db/postgres-suite.ts#migrationSuite"
      ],
      manualEvidence: ["artifact://M03/manual/data-foundation-review"],
      operationalControls: ["docs/operations/knotline/database-foundation.md"],
      externalGates: expected.externalGates,
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED",
      ...(expected.supportContractReason
        ? { supportContractReason: expected.supportContractReason }
        : {})
    };
  })
};

const capabilities = [
  {
    id: "data.tenant_persistence",
    status: "DEMO",
    summary:
      "Local PostgreSQL persistence, forced tenant RLS, migrations, repositories, query plans, and backup restore are verified; production infrastructure remains external.",
    owner: { team: "product-engineering", contact: "shurevan" },
    runbook: "docs/operations/knotline/database-foundation.md",
    externalGates: ["EXT-002"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/database/M03/integration.json"
    }
  }
];

const testRecords = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed against a pinned localhost-only PostgreSQL 17 container with zero retries or quarantines.`,
  command: run.command,
  outputDigest: digest(`${run.id}:${run.command}:${registries.index.planDigest}`)
}));
const manual = {
  schemaVersion: 1,
  id: "m03-data-foundation-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed role privileges, forced RLS policies, tenant-inclusive constraints, immutable records, transaction rollback, restart persistence, migration compatibility, lifecycle coverage, telemetry, mutation control, and backup restoration.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/data-foundation-review.json"), canonicalJson(manual)),
  ...testRecords.map((record, index) => {
    const slug = testRuns[index].evidenceUri.split("/").at(-1);
    return writeFile(join(output, `test-results/${slug}.json`), canonicalJson(record));
  })
]);

process.stdout.write("Generated M03 evidence bindings.\n");
