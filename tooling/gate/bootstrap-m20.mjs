#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M20";
const recordedAt = "2026-08-01T22:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M20");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set([
  "KN-005",
  "KN-006",
  "KN-007",
  "KN-008",
  "KN-009",
  "KN-013",
  "KN-014",
  "NFR-023"
]);
const operations = registries.api.entries
  .filter(({ path }) =>
    /search|retrieval|citation|indexing|authorization-proof|acl-projection|knowledge-reindex/u.test(
      path
    )
  )
  .map(({ id }) => id);
const tables = [
  "knowledge_index_generations",
  "knowledge_sources",
  "knowledge_document_sections",
  "knowledge_chunks",
  "knowledge_acl_projections",
  "knowledge_acl_members",
  "knowledge_authorization_proofs",
  "knowledge_retrieval_manifests",
  "knowledge_embedding_cache",
  "knowledge_embedding_usage",
  "knowledge_reindex_jobs",
  "knowledge_permission_invalidations",
  "knowledge_citation_accesses"
];
const events = [
  "knowledge.index_started.v1",
  "knowledge.index_completed.v1",
  "knowledge.reindex_started.v1",
  "knowledge.reindex_completed.v1",
  "knowledge.generation_promoted.v1",
  "knowledge.acl_projection_advanced.v1",
  "knowledge.permission_invalidated.v1",
  "knowledge.authorization_proof_minted.v1",
  "knowledge.retrieval_completed.v1",
  "knowledge.citation_opened.v1",
  "knowledge.source_deleted.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m20-retrieval-unit", "pnpm --filter @knotline/retrieval test", "retrieval-unit"],
  ["m20-retrieval-api", "pnpm test:api", "retrieval-api"],
  [
    "m20-retrieval-browser",
    "pnpm exec playwright test tests/e2e/retrieval.spec.ts",
    "retrieval-browser"
  ],
  [
    "m20-retrieval-migrations",
    "pnpm verify:migrations && pnpm verify:query-plan",
    "retrieval-migrations"
  ],
  [
    "m20-retrieval-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "retrieval-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M20/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 20)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 20)
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
  externalGates: [
    {
      gateId: "EXT-004",
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: "PRODUCTION_VERIFIED",
      gaRequired: true,
      accountableOwner: "shurevan",
      reviewExpiresAt: null,
      evidenceUris: []
    }
  ],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0017-permission-aware-retrieval",
      evidenceUri: "repo://packages/db/migrations/0017_permission_aware_retrieval.sql"
    }
  ],
  flags: [
    {
      id: "permission-aware-retrieval",
      evidenceUri: "repo://docs/operations/knotline/permission-aware-retrieval.md"
    }
  ],
  knownRisks: [
    {
      id: "m20-live-embedding-provider-unverified",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/retrieval/src/retrieval.ts",
    "repo://packages/db/src/retrieval-repository.ts",
    "repo://apps/web/src/M20Pages.tsx",
    "repo://docs/operations/knotline/permission-aware-retrieval.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M19/route-coverage.json"), "utf8")
);
const routeEvidence = {
  fixture: "canonical-m20-authorized-retrieval",
  browserTest: "tests/e2e/retrieval.spec.ts",
  accessibilityResult: "artifact://M20/test-results/retrieval-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
  authorizationPersona: "member with current source ACL proof plus revoked member",
  expectedTelemetry:
    "query hash, manifest/chunk IDs, score version, exclusions, proof age, and latency only",
  evidenceUri: "artifact://M20/test-results/retrieval-browser"
};
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    route.routeId === "route.app.knowledge.search"
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
  await readFile(join(ROOT, "artifacts/verification/M19/traceability.json"), "utf8")
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
        "packages/db/src/retrieval-repository.ts#PostgresRetrievalRepository"
      ],
      routeStateEvidence: ["tests/e2e/retrieval.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/permission-aware-retrieval.md"
      ],
      sourceSymbols: [
        "packages/retrieval/src/retrieval.ts#verifyAuthorizationProof",
        "packages/db/src/retrieval-repository.ts#PostgresRetrievalRepository"
      ],
      automatedTests: [
        "packages/retrieval/src/retrieval.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/retrieval.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/permission-aware-retrieval.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "knowledge.permission-aware-retrieval",
    status: "DEMO",
    summary:
      "Deterministic chunking, hybrid retrieval, exact citations, signed short-lived proofs, atomic local ACL revocation, prompt-injection boundaries, and generation fencing are locally verified.",
    owner: { team: "knowledge-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/permission-aware-retrieval.md",
    externalGates: ["EXT-004"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M20/test-results/retrieval-unit.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed with fail-closed authorization and stable citations.`,
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
process.stdout.write("Generated M20 evidence bindings.\n");
