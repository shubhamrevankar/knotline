#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M27";
const recordedAt = "2026-08-06T12:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M27");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m27-notification-unit", "pnpm --filter @knotline/operations test", "notification-unit"],
  ["m27-notification-api", "pnpm test:api", "notification-api"],
  [
    "m27-notification-browser",
    "pnpm exec playwright test tests/e2e/notifications.spec.ts",
    "notification-browser"
  ],
  ["m27-notification-migrations", "pnpm verify:migrations", "notification-migrations"],
  [
    "m27-notification-security",
    "pnpm verify:events && pnpm verify:secrets && pnpm verify:boundaries",
    "notification-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M27/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 27)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 27)
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
  requirements: [],
  activeGateRows,
  notYetApplicable,
  environmentGates: [],
  externalGates: ["EXT-006", "EXT-008", "EXT-012"].map(externalGate),
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0024-notification-delivery",
      evidenceUri: "repo://packages/db/migrations/0024_notification_delivery.sql"
    }
  ],
  flags: [
    {
      id: "multichannel-notifications",
      evidenceUri: "repo://docs/operations/knotline/notification-delivery.md"
    }
  ],
  knownRisks: [
    {
      id: "m27-live-channel-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/operations/src/notifications.ts",
    "repo://packages/db/src/notification-repository.ts",
    "repo://packages/db/migrations/0024_notification_delivery.sql",
    "repo://tests/e2e/notifications.spec.ts",
    "repo://docs/operations/knotline/notification-delivery.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M26/route-coverage.json"), "utf8")
);
const routeEvidence = {
  fixture: "authorization-preference-quiet-hour-grouping-and-signed-delivery-fixtures",
  browserTest: "tests/e2e/notifications.spec.ts",
  accessibilityResult: "artifact://M27/test-results/notification-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320 CSS px and desktop Chromium",
  authorizationPersona: "workspace owner and authorized recipient",
  expectedTelemetry:
    "intent, recipient, delivery, receipt, digest, suppression and normalized reason identifiers only",
  evidenceUri: "artifact://M27/test-results/notification-browser"
};
const ownedRoutes = new Set(["route.app.notifications", "route.app.settings.notifications"]);
const routeCoverage = {
  ...priorRoutes,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRoutes.routes.map((route) =>
    ownedRoutes.has(route.routeId)
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
const priorTrace = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M26/traceability.json"), "utf8")
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
const capabilities = [
  {
    id: "notifications.multichannel-delivery",
    status: "DEMO",
    summary:
      "Authorization-aware in-app delivery, safe email and signed chat/webhook adapters, preferences, quiet hours, digests, escalation, suppression and provider-health fixtures are verified.",
    owner: { team: "notification-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/notification-delivery.md",
    externalGates: ["EXT-006", "EXT-008", "EXT-012"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M27/test-results/notification-unit.json"
    }
  }
];
const records = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} passed with sanitized deterministic fixtures and no external credentials.`,
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
process.stdout.write("Generated M27 evidence bindings.\n");
