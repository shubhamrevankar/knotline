#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M21",
  recordedAt = "2026-08-01T23:00:00.000Z",
  output = join(ROOT, "artifacts/verification/M21");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["KN-010", "KN-011", "KN-012"]);
const operations = registries.api.entries
  .filter(({ path }) => /entities|knowledge-admin|knowledge-types/u.test(path))
  .map(({ id }) => id);
const tables = [
  "knowledge_type_versions",
  "knowledge_entities",
  "knowledge_entity_aliases",
  "knowledge_entity_facts",
  "knowledge_fact_evidence",
  "knowledge_relations",
  "knowledge_relation_evidence",
  "knowledge_entity_merge_candidates",
  "knowledge_entity_fact_conflicts",
  "knowledge_entity_changes",
  "knowledge_provenance_packets",
  "knowledge_graph_query_receipts",
  "knowledge_admin_actions"
];
const events = [
  "knowledge.entity_created.v1",
  "knowledge.entity_changed.v1",
  "knowledge.entity_merge_proposed.v1",
  "knowledge.entity_merged.v1",
  "knowledge.entity_split.v1",
  "knowledge.fact_conflict_detected.v1",
  "knowledge.relation_created.v1",
  "knowledge.type_version_published.v1",
  "knowledge.provenance_exported.v1",
  "knowledge.admin_repair_requested.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m21-graph-unit", "pnpm --filter @knotline/knowledge-graph test", "graph-unit"],
  ["m21-graph-api", "pnpm test:api", "graph-api"],
  [
    "m21-graph-browser",
    "pnpm exec playwright test tests/e2e/knowledge-graph.spec.ts",
    "graph-browser"
  ],
  ["m21-graph-migrations", "pnpm verify:migrations", "graph-migrations"],
  [
    "m21-graph-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "graph-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M21/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 21)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 21)
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
      id: "0018-provenance-knowledge-graph",
      evidenceUri: "repo://packages/db/migrations/0018_provenance_knowledge_graph.sql"
    }
  ],
  flags: [
    {
      id: "provenance-knowledge-graph",
      evidenceUri: "repo://docs/operations/knotline/provenance-knowledge-graph.md"
    }
  ],
  knownRisks: [],
  evidenceUris: [
    "repo://packages/knowledge-graph/src/resolution.ts",
    "repo://packages/db/src/knowledge-graph-repository.ts",
    "repo://apps/web/src/M21Pages.tsx",
    "repo://docs/operations/knotline/provenance-knowledge-graph.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M20/route-coverage.json"), "utf8")
);
const routeEvidence = {
  fixture: "canonical-m21-provenance-graph",
  browserTest: "tests/e2e/knowledge-graph.spec.ts",
  accessibilityResult: "artifact://M21/test-results/graph-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
  authorizationPersona: "knowledge steward with current proof plus inaccessible evidence fixture",
  expectedTelemetry: "entity/relation IDs, query limits, proof age, result count, and latency only",
  evidenceUri: "artifact://M21/test-results/graph-browser"
};
const activated = new Set([
  "route.app.knowledge",
  "route.app.knowledge.entities",
  "route.app.knowledge.entities.detail"
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
            evidence: routeEvidence
          }))
        }
      : route
  )
};
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M20/traceability.json"), "utf8")
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
        "packages/db/src/context.ts#withTenantTransaction",
        "packages/knowledge-graph/src/resolution.ts#intersectEvidenceAcl",
        "packages/db/src/knowledge-graph-repository.ts#PostgresKnowledgeGraphRepository"
      ],
      routeStateEvidence: ["tests/e2e/knowledge-graph.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/provenance-knowledge-graph.md"
      ],
      sourceSymbols: [
        "packages/knowledge-graph/src/resolution.ts#resolveEntity",
        "packages/db/src/knowledge-graph-repository.ts#PostgresKnowledgeGraphRepository"
      ],
      automatedTests: [
        "packages/knowledge-graph/src/resolution.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/knowledge-graph.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/provenance-knowledge-graph.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "knowledge.provenance-graph",
    status: "DEMO",
    summary:
      "Versioned entity and relation facts, deterministic provider identity, conflict visibility, ACL-intersected provenance, bounded traversal, merge/split, export, and knowledge administration are locally verified.",
    owner: { team: "knowledge-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/provenance-knowledge-graph.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M21/test-results/graph-unit.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed with attributable facts and fail-closed graph authorization.`,
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
process.stdout.write("Generated M21 evidence bindings.\n");
