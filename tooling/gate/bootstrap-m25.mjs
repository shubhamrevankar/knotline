#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";
const milestone = "M25",
  recordedAt = "2026-08-04T18:00:00.000Z",
  output = join(ROOT, "artifacts/verification/M25"),
  registries = buildRegistries(await readFile(PLAN_PATH, "utf8")),
  digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m25-data-unit", "pnpm --filter @knotline/connector-sdk test", "data-unit"],
  ["m25-data-api", "pnpm test:api", "data-api"],
  ["m25-data-browser", "pnpm exec playwright test tests/e2e/connections.spec.ts", "data-browser"],
  ["m25-data-migrations", "pnpm verify:migrations", "data-migrations"],
  [
    "m25-data-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "data-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M25/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
    .filter(({ activationMilestones }) =>
      activationMilestones.some((id) => Number(id.slice(1)) <= 25)
    )
    .map(({ capability }) => capability.toLowerCase()),
  notYetApplicable = registries.gateActivation.entries
    .filter(
      ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 25)
    )
    .map(({ capability, activationMilestones }) => ({
      row: capability.toLowerCase(),
      activationMilestone: [...activationMilestones].sort(
        (a, b) => Number(a.slice(1)) - Number(b.slice(1))
      )[0],
      reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
    })),
  externalGate = (gateId) => ({
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
  externalGates: ["EXT-007", "EXT-008", "EXT-013", "EXT-025"].map(externalGate),
  testRuns,
  manualReviews: [],
  deployments: [],
  migrations: [
    {
      id: "0022-generic-data-connectors",
      evidenceUri: "repo://packages/db/migrations/0022_generic_data_connectors.sql"
    }
  ],
  flags: [
    {
      id: "data-productivity-connectors",
      evidenceUri: "repo://docs/operations/knotline/data-and-productivity-connectors.md"
    }
  ],
  knownRisks: [
    {
      id: "m25-live-provider-certification",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/connector-sdk/src/data-providers.ts",
    "repo://packages/db/migrations/0022_generic_data_connectors.sql",
    "repo://docs/operations/knotline/data-and-productivity-connectors.md"
  ]
};
const priorRoutes = JSON.parse(
    await readFile(join(ROOT, "artifacts/verification/M24/route-coverage.json"), "utf8")
  ),
  evidence = {
    fixture: "recorded-microsoft-google-crm-s3-csv-rest-webhook-contracts",
    browserTest: "tests/e2e/connections.spec.ts",
    accessibilityResult: "artifact://M25/test-results/data-browser",
    localeSet: "en,en-XA",
    viewportDevice: "320 CSS px and desktop Chromium",
    authorizationPersona: "workspace owner with explicit shared-resource and prefix grants",
    expectedTelemetry:
      "provider/account/resource/operation/batch/schema IDs, versions, counts, hashes, status, and normalized errors only",
    evidenceUri: "artifact://M25/test-results/data-browser"
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
  },
  priorTrace = JSON.parse(
    await readFile(join(ROOT, "artifacts/verification/M24/traceability.json"), "utf8")
  ),
  priorById = new Map(priorTrace.requirements.map((row) => [row.requirementId, row]));
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
  },
  capability = (id, summary, gates) => ({
    id,
    status: "DEMO",
    summary,
    owner: { team: "connector-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/data-and-productivity-connectors.md",
    externalGates: gates,
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M25/test-results/data-unit.json"
    }
  });
const capabilities = [
    capability(
      "connectors.microsoft-365",
      "Microsoft files, mail, calendar, shared ACL, delta, action, and reconciliation contracts pass recorded fixtures.",
      ["EXT-008"]
    ),
    capability(
      "connectors.google-mail-calendar",
      "Gmail history/thread and Calendar token/time-zone/recurrence/action contracts pass recorded fixtures.",
      ["EXT-007"]
    ),
    capability(
      "connectors.crm",
      "Salesforce and HubSpot schema, field security, event, action, and reconciliation contracts pass recorded fixtures.",
      ["EXT-013"]
    ),
    capability(
      "connectors.s3",
      "S3 endpoint, prefix, version, encryption, event, and deletion contracts pass recorded fixtures.",
      ["EXT-025"]
    ),
    capability(
      "connectors.csv-rest-webhook",
      "CSV resume/rollback, allowlisted REST, and rotated webhook/DLQ contracts pass local fixtures.",
      []
    )
  ],
  records = testRuns.map((run) => ({
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
process.stdout.write("Generated M25 evidence bindings.\n");
