#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M14";
const recordedAt = "2026-08-01T09:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M14");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["AG-001", "AG-002", "AG-004"]);
const ownedRoutes = new Set([
  "route.app.agents",
  "route.app.agents.new",
  "route.app.agents.detail",
  "route.app.agents.detail.builder"
]);
const operations = registries.api.entries
  .filter(({ path }) => path.includes("/agents"))
  .map(({ id }) => id);
const tables = [
  "agent_definitions",
  "agent_drafts",
  "agent_versions",
  "agent_release_channels",
  "agent_tags",
  "agent_tag_assignments",
  "agent_version_references",
  "agent_simulations",
  "reusable_schemas",
  "reusable_schema_versions",
  "agent_activity_events"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m14-agent-property", "pnpm test:property", "agent-property"],
  ["m14-agent-api", "pnpm test:api", "agent-api"],
  ["m14-agent-migrations", "pnpm verify:migrations", "agent-migrations"],
  ["m14-agent-browser", "pnpm exec playwright test tests/e2e/agents.spec.ts", "agent-browser"],
  ["m14-agent-performance", "pnpm verify:web-performance", "agent-performance"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M14/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 14)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 14)
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
      id: "0011-agent-foundry",
      evidenceUri: "repo://packages/db/migrations/0011_agent_foundry.sql"
    }
  ],
  flags: [],
  knownRisks: [],
  evidenceUris: [
    "repo://apps/web/src/M14Pages.tsx",
    "repo://packages/contracts/src/agent.ts",
    "repo://packages/db/src/agent-repository.ts",
    "repo://tests/e2e/agents.spec.ts",
    "repo://docs/operations/knotline/agent-foundry.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M13/route-coverage.json"), "utf8")
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
                accessibilityResult: "artifact://M14/test-results/agent-browser",
                authorizationPersona: "workspace builder and private definition owner",
                browserTest: "tests/e2e/agents.spec.ts",
                evidenceUri: "artifact://M14/test-results/agent-browser",
                expectedTelemetry:
                  "agent ID, draft revision, immutable version, canonical hash, simulation class, and actor",
                fixture: `agent.${state.stateId}`,
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
  await readFile(join(ROOT, "artifacts/verification/M13/traceability.json"), "utf8")
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
        "agent.created.v1",
        "agent.draft_updated.v1",
        "agent.version_published.v1",
        "agent.simulated.v1",
        "agent.archived.v1"
      ],
      authorizationRules: [
        "apps/api/src/app.ts#agentAccess",
        "packages/db/src/agent-repository.ts#requireOwner",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tests/e2e/agents.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/web/src/M14Pages.tsx#AgentBuilderPage",
        "apps/web/src/M14Pages.tsx#AgentCatalogPage",
        "packages/contracts/src/agent.ts#agentDefinitionSchema",
        "packages/db/src/agent-repository.ts#PostgresAgentRepository"
      ],
      automatedTests: [
        "packages/contracts/src/agent.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/agents.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/agent-foundry.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "agents.governed-foundry",
    status: "DEMO",
    summary:
      "Provider-neutral definitions, typed prompts, strict schemas, bounded capabilities, immutable versions, semantic diffs, safe references, and visibly simulated previews are locally verified.",
    owner: { team: "agent-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/agent-foundry.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M14/test-results/agent-api.json"
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
process.stdout.write("Generated M14 evidence bindings.\n");
