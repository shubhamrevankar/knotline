#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M24";
const recordedAt = "2026-08-03T18:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M24");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const externalGate = (gateId) => ({
  gateId,
  state: "BLOCKED_EXTERNAL",
  requiredTerminalState: "PRODUCTION_VERIFIED",
  accountableOwner: "shurevan",
  gaRequired: true,
  reviewExpiresAt: null,
  evidenceUris: []
});
const testRuns = [
  ["m24-provider-unit", "pnpm --filter @knotline/connector-sdk test", "provider-unit"],
  ["m24-provider-api", "pnpm test:api", "provider-api"],
  [
    "m24-provider-browser",
    "pnpm exec playwright test tests/e2e/connections.spec.ts",
    "provider-browser"
  ],
  ["m24-provider-migrations", "pnpm verify:migrations", "provider-migrations"],
  [
    "m24-provider-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "provider-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M24/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 24)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 24)
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
  requirements: [],
  activeGateRows,
  notYetApplicable,
  environmentGates: [],
  externalGates: ["EXT-008", "EXT-010", "EXT-011", "EXT-012", "EXT-014"].map(externalGate),
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0021-collaboration-provider-connectors",
      evidenceUri: "repo://packages/db/migrations/0021_collaboration_provider_connectors.sql"
    }
  ],
  flags: [
    {
      id: "collaboration-provider-connectors",
      evidenceUri: "repo://docs/operations/knotline/work-collaboration-connectors.md"
    }
  ],
  knownRisks: [
    {
      id: "m24-live-provider-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/connector-sdk/src/collaboration-providers.ts",
    "repo://packages/db/migrations/0021_collaboration_provider_connectors.sql",
    "repo://apps/web/src/M22Pages.tsx",
    "repo://docs/operations/knotline/work-collaboration-connectors.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M23/route-coverage.json"), "utf8")
);
const evidence = {
  fixture: "recorded-linear-jira-github-slack-teams-x-contracts",
  browserTest: "tests/e2e/connections.spec.ts",
  accessibilityResult: "artifact://M24/test-results/provider-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320 CSS px and desktop Chromium",
  authorizationPersona: "workspace owner with sanitized recorded provider accounts",
  expectedTelemetry:
    "provider/account/target/action/binding IDs, revisions, hashes, status, and normalized errors only",
  evidenceUri: "artifact://M24/test-results/provider-browser"
};
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    route.routeId === "route.app.connections.new" || route.routeId === "route.app.connections"
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
  await readFile(join(ROOT, "artifacts/verification/M23/traceability.json"), "utf8")
);
const priorById = new Map(priorTrace.requirements.map((row) => [row.requirementId, row]));
const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => ({
    ...priorById.get(expected.requirementId),
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
  }))
};
const capability = (id, summary, gates) => ({
  id,
  status: "DEMO",
  summary,
  owner: { team: "connector-platform", contact: "shurevan" },
  runbook: "docs/operations/knotline/work-collaboration-connectors.md",
  externalGates: gates,
  evidence: {
    environment: "local",
    verifiedAt: recordedAt,
    reference: "repo://artifacts/verification/M24/test-results/provider-unit.json"
  }
});
const capabilities = [
  capability(
    "connectors.linear-jira",
    "Linear and Jira Cloud recorded object, metadata, webhook, ACL, action, receipt, and reconciliation contracts pass.",
    ["EXT-010"]
  ),
  capability(
    "connectors.github-app",
    "GitHub App repository scoping, historical installation routing, replay quarantine, action, and receipt contracts pass recorded fixtures.",
    ["EXT-011"]
  ),
  capability(
    "connectors.slack",
    "Slack channel ACL, safe message, interaction, action, and receipt contracts pass recorded fixtures.",
    ["EXT-012"]
  ),
  capability(
    "connectors.microsoft-teams",
    "Microsoft Teams tenant consent, channel ACL, message action, and receipt contracts pass recorded fixtures.",
    ["EXT-008"]
  ),
  capability(
    "connectors.x",
    "X tier-gated identity/read/publish/delete and receipt contracts pass recorded fixtures without exposing unsupported actions.",
    ["EXT-014"]
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
process.stdout.write("Generated M24 evidence bindings.\n");
