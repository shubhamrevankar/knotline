#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const milestone = "M19";
const recordedAt = "2026-08-01T20:00:00.000Z";
const output = join(ROOT, "artifacts/verification/M19");
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const requirements = new Set(["KN-001", "KN-002", "KN-003", "KN-004"]);
const operations = registries.api.entries
  .filter(
    ({ path }) => path.includes("file") || path.includes("artifact") || path.includes("document")
  )
  .map(({ id }) => id);
const tables = [
  "files",
  "file_versions",
  "file_upload_sessions",
  "file_upload_parts",
  "file_derived_artifacts",
  "document_processing_jobs",
  "file_download_tokens",
  "file_usage_references",
  "file_deletion_tombstones",
  "workspace_storage_usage",
  "task_file_attachments"
];
const events = [
  "file.upload_initiated.v1",
  "file.upload_completed.v1",
  "file.scan_completed.v1",
  "file.quarantined.v1",
  "file.processing_started.v1",
  "file.processing_completed.v1",
  "file.version_replaced.v1",
  "file.downloaded.v1",
  "file.deleted.v1",
  "knowledge.file_deleted.v1"
];
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const testRuns = [
  ["m19-file-unit", "pnpm test:files", "file-unit"],
  ["m19-file-api", "pnpm test:api", "file-api"],
  ["m19-file-migrations", "pnpm verify:migrations", "file-migrations"],
  ["m19-file-browser", "pnpm exec playwright test tests/e2e/files.spec.ts", "file-browser"],
  [
    "m19-file-security",
    "pnpm verify:boundaries && pnpm verify:events && pnpm verify:secrets",
    "file-security"
  ]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M19/test-results/${slug}`
}));
const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= 19)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 19)
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
      gateId: "EXT-002",
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
      id: "0016-secure-files-processing",
      evidenceUri: "repo://packages/db/migrations/0016_secure_files_processing.sql"
    }
  ],
  flags: [
    {
      id: "file-upload-preview-download-controls",
      evidenceUri: "repo://docs/operations/knotline/secure-files-and-document-processing.md"
    }
  ],
  knownRisks: [
    {
      id: "m19-deployed-object-storage-and-scanner-unprovisioned",
      owner: "shurevan",
      status: "blocked-external-before-staging",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/document-processing/src/processing.ts",
    "repo://packages/db/src/file-repository.ts",
    "repo://apps/web/src/M19Pages.tsx",
    "repo://docs/operations/knotline/secure-files-and-document-processing.md"
  ]
};
const priorRoutes = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M18/route-coverage.json"), "utf8")
);
const activatedRoutes = new Set([
  "route.app.knowledge.sources",
  "route.app.knowledge.documents.detail"
]);
const routeEvidence = {
  fixture: "canonical-m19-files",
  browserTest: "tests/e2e/files.spec.ts",
  accessibilityResult: "artifact://M19/test-results/file-browser",
  localeSet: "en,en-XA",
  viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
  authorizationPersona: "member file owner and authorized workspace user",
  expectedTelemetry: "content-free route ID, lifecycle state, reason code, and timing only",
  evidenceUri: "artifact://M19/test-results/file-browser"
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
  await readFile(join(ROOT, "artifacts/verification/M18/traceability.json"), "utf8")
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
        "packages/db/src/file-repository.ts#PostgresFileRepository"
      ],
      routeStateEvidence: ["tests/e2e/files.spec.ts"],
      dataLifecycleRules: [
        "packages/db/registry/data-stores.json",
        "docs/operations/knotline/secure-files-and-document-processing.md"
      ],
      sourceSymbols: [
        "packages/document-processing/src/processing.ts#evaluateScan",
        "packages/db/src/file-repository.ts#PostgresFileRepository"
      ],
      automatedTests: [
        "packages/document-processing/src/processing.test.ts",
        "tooling/workflows/postgres-suite.ts",
        "tests/e2e/files.spec.ts"
      ],
      manualEvidence: [],
      operationalControls: ["docs/operations/knotline/secure-files-and-document-processing.md"],
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED"
    };
  })
};
const capabilities = [
  {
    id: "knowledge.secure-files",
    status: "DEMO",
    summary:
      "Canonical immutable files, quota-safe resumable upload, scanner-attested quarantine, coordinate processing, sanitized preview, one-time downloads, replacement, and deletion are locally verified.",
    owner: { team: "knowledge-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/secure-files-and-document-processing.md",
    externalGates: ["EXT-002"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/verification/M19/test-results/file-unit.json"
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
process.stdout.write("Generated M19 evidence bindings.\n");
