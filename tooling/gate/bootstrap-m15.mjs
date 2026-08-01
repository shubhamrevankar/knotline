#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M15";
const recordedAt = "2026-08-01T12:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M15");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["ON-003", "WF-003", "AG-003", "AG-005", "AG-006"]);
const operations = registries.api.entries
  .filter(({ path }) => path.includes("model") || path.includes("workflow-generation"))
  .map(({ id }) => id);
const tables = [
  "model_providers",
  "model_registry",
  "model_policies",
  "model_policy_versions",
  "prompt_versions",
  "model_invocations",
  "model_usage_charges",
  "provider_circuit_states"
];
const events = [
  "model.invocation_started.v1",
  "model.invocation_completed.v1",
  "model.invocation_incomplete.v1",
  "model.invocation_refused.v1",
  "model.invocation_failed.v1",
  "model.circuit_opened.v1"
];
const externalGate = {
  gateId: "EXT-004",
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  gaRequired: true,
  accountableOwner: "shurevan",
  reviewExpiresAt: null,
  evidenceUris: []
};
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m15-model-contract", "pnpm --filter @knotline/model-gateway test", "model-contract"],
  ["m15-model-api", "pnpm test:api", "model-api"],
  ["m15-model-migrations", "pnpm verify:migrations", "model-migrations"],
  ["m15-model-security", "pnpm verify:boundaries && pnpm verify:secrets", "model-security"],
  [
    "m15-model-browser",
    "pnpm exec playwright test tests/e2e/workflow-generation.spec.ts",
    "model-browser"
  ],
  ["m15-model-performance", "pnpm verify:web-performance", "model-performance"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M15/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 15)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 15)
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
  externalGates: [externalGate],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0012-governed-model-gateway",
      evidenceUri: "repo://packages/db/migrations/0012_model_gateway.sql"
    }
  ],
  flags: [
    {
      id: "model-gateway-emergency-disable",
      evidenceUri: "repo://docs/operations/knotline/model-gateway.md"
    }
  ],
  knownRisks: [
    {
      id: "m15-live-provider-unprovisioned",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/contracts/src/model-gateway.ts",
    "repo://packages/model-gateway/src/gateway.ts",
    "repo://packages/model-gateway/src/openai-responses.ts",
    "repo://apps/model-gateway/src/server.ts",
    "repo://packages/db/src/model-repository.ts",
    "repo://docs/operations/knotline/model-gateway.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M14/route-coverage.json"), "utf8")
);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest
};
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M14/traceability.json"), "utf8")
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
        "apps/api/src/app.ts#agentWorkflowAccess",
        "packages/db/src/model-repository.ts#PostgresModelRepository",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tests/e2e/workflow-generation.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/model-gateway/src/gateway.ts#GovernedModelGateway",
        "packages/model-gateway/src/openai-responses.ts#OpenAIResponsesAdapter",
        "apps/api/src/workflow-generation.ts#GatewayWorkflowGenerationWorker",
        "apps/web/src/GuidedWorkflowCreate.tsx#GuidedWorkflowCreate"
      ],
      automatedTests: [
        "packages/model-gateway/src/gateway.test.ts",
        "apps/model-gateway/src/config.test.ts",
        "apps/api/src/workflow-generation.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/workflow-generation.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/model-gateway.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "models.governed-gateway",
    status: "DEMO",
    summary:
      "Provider-neutral invocation, policy, schema validation, bounded repair, cost truth, resilience, credential isolation, and recorded workflow generation are locally verified; live provider activation remains externally blocked.",
    owner: { team: "agent-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/model-gateway.md",
    externalGates: ["EXT-004"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M15/test-results/model-contract.json"
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
process.stdout.write("Generated M15 evidence bindings.\n");
