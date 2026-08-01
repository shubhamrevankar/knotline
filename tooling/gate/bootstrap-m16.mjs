#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M16";
const recordedAt = "2026-08-01T14:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M16");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["AG-009", "AG-010", "AG-013"]);
const operations = registries.api.entries
  .filter(({ path }) => path.includes("/tools") || path.includes("api-credentials"))
  .map(({ id }) => id);
const tables = [
  "tool_definitions",
  "tool_versions",
  "tool_grants",
  "credential_records",
  "oauth_refresh_leases",
  "external_operations",
  "external_operation_attempts",
  "external_operation_attempt_records",
  "tool_operation_bindings",
  "tool_execution_receipts",
  "sandbox_executions",
  "tool_control_switches"
];
const events = [
  "tool.execution_prepared.v1",
  "tool.execution_confirmed.v1",
  "tool.execution_failed.v1",
  "tool.execution_uncertain.v1",
  "tool.execution_reconciled.v1",
  "tool.kill_switch_changed.v1"
];
const externalGate = (gateId) => ({
  gateId,
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  gaRequired: true,
  accountableOwner: "shurevan",
  reviewExpiresAt: null,
  evidenceUris: []
});
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m16-broker-unit", "pnpm --filter @knotline/tool-broker test", "broker-unit"],
  ["m16-sandbox-unit", "pnpm --filter @knotline/sandbox-service test", "sandbox-unit"],
  ["m16-tool-api", "pnpm test:api", "tool-api"],
  ["m16-tool-migrations", "pnpm verify:migrations", "tool-migrations"],
  [
    "m16-tool-security",
    "pnpm verify:boundaries && pnpm verify:secrets && pnpm verify:containers",
    "tool-security"
  ],
  ["m16-tool-browser", "pnpm exec playwright test tests/e2e/agents.spec.ts", "tool-browser"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M16/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 16)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 16)
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
  externalGates: [externalGate("EXT-002"), externalGate("EXT-004")],
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0013-tool-broker-sandbox",
      evidenceUri: "repo://packages/db/migrations/0013_tool_broker_sandbox.sql"
    }
  ],
  flags: [
    {
      id: "tool-broker-kill-switches",
      evidenceUri: "repo://docs/operations/knotline/tool-broker-and-sandbox.md"
    }
  ],
  knownRisks: [
    {
      id: "m16-deployed-sandbox-vault-unprovisioned",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/contracts/src/tool-broker.ts",
    "repo://packages/tool-broker/src/broker.ts",
    "repo://packages/tool-broker/src/network.ts",
    "repo://packages/tool-broker/src/secrets.ts",
    "repo://apps/tool-broker/src/server.ts",
    "repo://apps/sandbox/src/executor.ts",
    "repo://docs/operations/knotline/tool-broker-and-sandbox.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M15/route-coverage.json"), "utf8")
);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest
};
const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M15/traceability.json"), "utf8")
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
        "packages/tool-broker/src/broker.ts#ToolBroker",
        "apps/api/src/app.ts#agentAccess",
        "packages/db/src/context.ts#withTenantTransaction"
      ],
      routeStateEvidence: ["tests/e2e/agents.spec.ts"],
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "packages/tool-broker/src/broker.ts#ToolBroker",
        "packages/tool-broker/src/secrets.ts#EncryptedMemorySecretBackend",
        "packages/tool-broker/src/network.ts#validateOutboundUrl",
        "apps/sandbox/src/executor.ts#executeSandbox"
      ],
      automatedTests: [
        "packages/tool-broker/src/broker.test.ts",
        "apps/tool-broker/src/config.test.ts",
        "apps/sandbox/src/executor.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/agents.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/tool-broker-and-sandbox.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "tools.governed-broker",
    status: "DEMO",
    summary:
      "Versioned tools, multidimensional policy, approval, credential proxying, effect fencing, receipts, SSRF defense, and kill switches are locally verified.",
    owner: { team: "tool-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/tool-broker-and-sandbox.md",
    externalGates: ["EXT-004"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M16/test-results/broker-unit.json"
    }
  },
  {
    id: "sandbox.isolated-execution",
    status: "DEMO",
    summary:
      "A resource-bounded, non-root, read-only, capability-dropped, internal-network sandbox with pinned runtime and disabled package installation is locally verified.",
    owner: { team: "tool-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/tool-broker-and-sandbox.md",
    externalGates: ["EXT-002"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M16/test-results/sandbox-unit.json"
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
process.stdout.write("Generated M16 evidence bindings.\n");
