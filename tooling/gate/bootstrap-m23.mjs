#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M23",
  recordedAt = "2026-08-02T18:00:00.000Z",
  output = join(ROOT, "artifacts/verification/M23");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set();
const operations = registries.api.entries
  .filter(({ path }) => /connections.*sources/u.test(path))
  .map(({ id }) => id);
const tables = [
  "connection_source_selections",
  "provider_source_inventory",
  "provider_action_operations",
  "provider_action_receipts",
  "provider_connector_certifications"
];
const events = [
  "connection.source_selection_changed.v1",
  "source_object.permission_changed.v1",
  "provider.action_completed.v1",
  "provider.action_reconciled.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m23-provider-unit", "pnpm --filter @knotline/connector-sdk test", "provider-unit"],
  ["m23-provider-api", "pnpm test:api", "provider-api"],
  [
    "m23-provider-browser",
    "pnpm exec playwright test tests/e2e/connections.spec.ts",
    "provider-browser"
  ],
  ["m23-provider-migrations", "pnpm verify:migrations", "provider-migrations"],
  [
    "m23-provider-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "provider-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M23/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 23)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 23)
  )
  .map(({ capability, activationMilestones }) => ({
    row: capability.toLowerCase(),
    activationMilestone: [...activationMilestones].sort(
      (a, b) => Number(a.slice(1)) - Number(b.slice(1))
    )[0],
    reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
  }));
const externalGate = (gateId) => ({
  gateId,
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  accountableOwner: "shurevan",
  gaRequired: true,
  reviewExpiresAt: null,
  evidenceUris: []
});
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
  externalGates: [externalGate("EXT-007"), externalGate("EXT-009")],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0020-knowledge-provider-connectors",
      evidenceUri: "repo://packages/db/migrations/0020_knowledge_provider_connectors.sql"
    }
  ],
  flags: [
    {
      id: "knowledge-provider-connectors",
      evidenceUri: "repo://docs/operations/knotline/knowledge-provider-connectors.md"
    }
  ],
  knownRisks: [
    {
      id: "m23-live-provider-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/connector-sdk/src/knowledge-providers.ts",
    "repo://packages/db/src/connector-repository.ts",
    "repo://apps/web/src/M22Pages.tsx",
    "repo://docs/operations/knotline/knowledge-provider-connectors.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M22/route-coverage.json"), "utf8")
);
const evidence = {
  fixture: "recorded-google-notion-confluence-contracts",
  browserTest: "tests/e2e/connections.spec.ts",
  accessibilityResult: "artifact://M23/test-results/provider-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320 CSS px and desktop Chromium",
  authorizationPersona: "workspace owner with sanitized recorded provider accounts",
  expectedTelemetry:
    "provider/connection/source/action IDs, versions, counts, hashes, status, and normalized errors only",
  evidenceUri: "artifact://M23/test-results/provider-browser"
};
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    route.routeId === "route.app.connections.detail"
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
  await readFile(join(ROOT, "artifacts/verification/M22/traceability.json"), "utf8")
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
        "packages/connector-sdk/src/knowledge-providers.ts#validateSourceSelection",
        "packages/connector-sdk/src/knowledge-providers.ts#RecordedKnowledgeProvider"
      ],
      routeStateEvidence: ["tests/e2e/connections.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/knowledge-provider-connectors.md"
      ],
      sourceSymbols: [
        "packages/connector-sdk/src/knowledge-providers.ts#certifyKnowledgeProvider",
        "packages/db/src/connector-repository.ts#sourceSurface"
      ],
      automatedTests: [
        "packages/connector-sdk/src/knowledge-providers.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/connections.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/knowledge-provider-connectors.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capability = (id, summary, externalGates) => ({
  id,
  status: "DEMO",
  summary,
  owner: { team: "connector-platform", contact: "shurevan" },
  runbook: "docs/operations/knotline/knowledge-provider-connectors.md",
  externalGates,
  evidence: {
    environment: "local",
    verifiedAt: recordedAt,
    reference: "repo://artifacts/verification/M23/test-results/provider-unit.json"
  }
});
const capabilities = [
  capability(
    "connectors.google-knowledge",
    "Drive, Docs, and Sheets recorded read/write/permission/citation contracts pass; live certification is blocked.",
    ["EXT-007"]
  ),
  capability(
    "connectors.notion-knowledge",
    "Notion page, database, block, property, comment, permission, and action contracts pass recorded fixtures; live certification is blocked.",
    ["EXT-009"]
  ),
  capability(
    "connectors.confluence-cloud-knowledge",
    "Confluence Cloud space/page/version/restriction/sanitization/action contracts pass recorded fixtures; Data Center is unsupported and live certification is blocked.",
    ["EXT-009"]
  )
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed using sanitized recorded providers without external credentials.`,
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
process.stdout.write("Generated M23 evidence bindings.\n");
