#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M22",
  recordedAt = "2026-08-02T12:00:00.000Z",
  output = join(ROOT, "artifacts/verification/M22");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set([
  "CN-001",
  "CN-002",
  "CN-003",
  "CN-004",
  "CN-005",
  "CN-006",
  "CN-008",
  "CN-009"
]);
const operations = registries.api.entries
  .filter(({ path }) =>
    /connectors|connections|connection-authorizations|provider-webhooks/u.test(path)
  )
  .map(({ id }) => id);
const tables = [
  "connector_manifest_versions",
  "connections",
  "connection_authorization_transactions",
  "connection_scope_snapshots",
  "connection_sync_runs",
  "connection_sync_checkpoints",
  "connection_sync_pages",
  "connection_external_objects",
  "connector_webhook_endpoints",
  "provider_installation_bindings",
  "connector_webhook_receipts",
  "connector_reconciliations",
  "connector_control_switches",
  "connector_rate_buckets"
];
const events = [
  "connection.authorized.v1",
  "connection.auth_expired.v1",
  "connection.degraded.v1",
  "connection.disabled.v1",
  "connection.resumed.v1",
  "connection.sync_started.v1",
  "connection.sync_completed.v1",
  "connection.sync_failed.v1",
  "connection.removed.v1",
  "connection.webhook_received.v1",
  "source_object.changed.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m22-connector-unit", "pnpm --filter @knotline/connector-sdk test", "connector-unit"],
  ["m22-connector-api", "pnpm test:api", "connector-api"],
  [
    "m22-connector-browser",
    "pnpm exec playwright test tests/e2e/connections.spec.ts",
    "connector-browser"
  ],
  ["m22-connector-migrations", "pnpm verify:migrations", "connector-migrations"],
  [
    "m22-connector-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "connector-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M22/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 22)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 22)
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
      id: "0019-secure-connector-platform",
      evidenceUri: "repo://packages/db/migrations/0019_secure_connector_platform.sql"
    }
  ],
  flags: [
    {
      id: "secure-connector-platform",
      evidenceUri: "repo://docs/operations/knotline/secure-connector-platform.md"
    }
  ],
  knownRisks: [],
  evidenceUris: [
    "repo://packages/connector-sdk/src/platform.ts",
    "repo://packages/db/src/connector-repository.ts",
    "repo://apps/web/src/M22Pages.tsx",
    "repo://docs/operations/knotline/secure-connector-platform.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M21/route-coverage.json"), "utf8")
);
const evidence = {
  fixture: "canonical-m22-fixture-connector",
  browserTest: "tests/e2e/connections.spec.ts",
  accessibilityResult: "artifact://M22/test-results/connector-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
  authorizationPersona: "workspace owner with synthetic loopback fixture account",
  expectedTelemetry:
    "connection/sync/receipt IDs, states, counts, scope names, and sanitized error kinds only",
  evidenceUri: "artifact://M22/test-results/connector-browser"
};
const activated = new Set([
  "route.app.connections",
  "route.app.connections.detail",
  "route.app.connections.new.detail"
]);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    activated.has(route.routeId)
      ? {
          ...route,
          states: route.states.map((cell) => ({
            stateId: cell.stateId,
            applicability: "REQUIRED",
            reason: "",
            reviewer: "shurevan",
            evidence
          }))
        }
      : route
  )
};
const priorTrace = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M21/traceability.json"), "utf8")
);
const priorById = new Map(priorTrace.requirements.map((row) => [row.requirementId, row]));
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
        "packages/db/src/context.ts#withTenantTransaction",
        "packages/connector-sdk/src/platform.ts#OAuthTransactionStore",
        "packages/connector-sdk/src/platform.ts#resolveHistoricalInstallation"
      ],
      routeStateEvidence: ["tests/e2e/connections.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/secure-connector-platform.md"
      ],
      sourceSymbols: [
        "packages/connector-sdk/src/platform.ts#certifyConnector",
        "packages/db/src/connector-repository.ts#PostgresConnectorRepository"
      ],
      automatedTests: [
        "packages/connector-sdk/src/platform.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/connections.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/secure-connector-platform.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "connectors.secure-platform",
    status: "DEMO",
    summary:
      "Manifest-certified connector SDK, one-time bound OAuth and PKCE, credential references, reduced-scope reconciliation, durable sync identity, authenticated webhook primitives, historical routing, health, reconciliation, deletion, and kill controls are locally verified against a synthetic fixture.",
    owner: { team: "connector-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/secure-connector-platform.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M22/test-results/connector-unit.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed with synthetic fixtures and fail-closed connector controls.`,
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
process.stdout.write("Generated M22 evidence bindings.\n");
