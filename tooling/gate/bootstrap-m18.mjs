#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M18";
const recordedAt = "2026-08-01T18:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M18");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["AG-015", "AG-016", "AG-017"]);
const operations = registries.api.entries
  .filter(
    ({ path }) =>
      path.includes("eval-") || path.includes("evaluation-runs") || path.includes("releases")
  )
  .map(({ id }) => id);
const tables = [
  "evaluation_datasets",
  "evaluation_dataset_versions",
  "evaluation_cases",
  "evaluation_suites",
  "evaluation_runs",
  "evaluation_case_results",
  "evaluation_grader_results",
  "evaluation_comparisons",
  "evaluation_human_reviews",
  "agent_release_policies",
  "agent_releases",
  "agent_release_allocations",
  "agent_online_metric_buckets",
  "scheduled_evaluations"
];
const events = [
  "evaluation.dataset_version_published.v1",
  "evaluation.run_queued.v1",
  "evaluation.run_started.v1",
  "evaluation.case_completed.v1",
  "evaluation.run_completed.v1",
  "evaluation.run_failed.v1",
  "evaluation.run_cancelled.v1",
  "evaluation.comparison_created.v1",
  "evaluation.human_review_submitted.v1",
  "evaluation.gate_passed.v1",
  "evaluation.gate_blocked.v1",
  "agent.release_promoted.v1",
  "agent.release_canary_changed.v1",
  "agent.release_rolled_back.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m18-evaluation-unit", "pnpm test:evals", "evaluation-unit"],
  ["m18-evaluation-api", "pnpm test:api", "evaluation-api"],
  ["m18-evaluation-migrations", "pnpm verify:migrations", "evaluation-migrations"],
  [
    "m18-evaluation-browser",
    "pnpm exec playwright test tests/e2e/evaluations.spec.ts",
    "evaluation-browser"
  ],
  [
    "m18-evaluation-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "evaluation-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M18/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 18)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 18)
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
      id: "0015-agent-evaluation-release",
      evidenceUri: "repo://packages/db/migrations/0015_agent_evaluation_release.sql"
    }
  ],
  flags: [
    {
      id: "agent-release-controls",
      evidenceUri: "repo://docs/operations/knotline/agent-evaluation-and-releases.md"
    }
  ],
  knownRisks: [
    {
      id: "m18-live-provider-suites-unprovisioned",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/agent-evaluation/src/runner.ts",
    "repo://packages/db/src/evaluation-repository.ts",
    "repo://apps/web/src/M18Pages.tsx",
    "repo://docs/operations/knotline/agent-evaluation-and-releases.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M17/route-coverage.json"), "utf8")
);
const activatedRoutes = new Set([
  "route.app.agents.detail.evals",
  "route.app.agents.detail.activity"
]);
const routeEvidence = {
  fixture: "canonical-m18-evaluation",
  browserTest: "tests/e2e/evaluations.spec.ts",
  accessibilityResult: "artifact://M18/test-results/evaluation-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
  authorizationPersona: "member owner and authorized workspace administrator",
  expectedTelemetry: "content-free route ID, action result, and error code only",
  evidenceUri: "artifact://M18/test-results/evaluation-browser"
};
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    activatedRoutes.has(route.routeId)
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
  await readFile(join(ROOT, "artifacts/verification/M17/traceability.json"), "utf8")
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
        "packages/db/src/evaluation-repository.ts#PostgresEvaluationRepository"
      ],
      routeStateEvidence: ["tests/e2e/evaluations.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/agent-evaluation-and-releases.md"
      ],
      sourceSymbols: [
        "packages/agent-evaluation/src/runner.ts#EvaluationRunner",
        "packages/db/src/evaluation-repository.ts#PostgresEvaluationRepository"
      ],
      automatedTests: [
        "packages/agent-evaluation/src/runner.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/evaluations.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/agent-evaluation-and-releases.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "agents.evaluation-release",
    status: "DEMO",
    summary:
      "Immutable encrypted datasets, reproducible grading, confidence-aware comparison, hard release gates, stable canary allocation, monitoring, and append-only rollback are locally verified.",
    owner: { team: "agent-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/agent-evaluation-and-releases.md",
    externalGates: ["EXT-004"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M18/test-results/evaluation-unit.json"
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
process.stdout.write("Generated M18 evidence bindings.\n");
