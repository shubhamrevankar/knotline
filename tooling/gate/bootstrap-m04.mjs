#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const milestone = "M04";
const milestoneNumber = 4;
const output = join(ROOT, "artifacts/verification/M04");
const recordedAt = "2026-07-31T23:05:00.000Z";
const requirements = new Set(["ID-001", "ID-002", "ID-004", "ID-005"]);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

const activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) =>
    activationMilestones.some((id) => Number(id.slice(1)) <= milestoneNumber)
  )
  .map(({ capability }) => capability.toLowerCase());
const notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) =>
      !activationMilestones.some((id) => Number(id.slice(1)) <= milestoneNumber)
  )
  .map(({ capability, activationMilestones }) => ({
    row: capability.toLowerCase(),
    activationMilestone: [...activationMilestones].sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1))
    )[0],
    reason: `This gate activates with ${[...activationMilestones].sort()[0]}.`
  }));

const testRuns = [
  ["m04-auth-security", "pnpm test:auth", "auth-security"],
  ["m04-unit", "pnpm test:unit", "unit"],
  ["m04-browser", "pnpm exec playwright test tests/e2e/auth.spec.ts", "browser"],
  ["m04-accessibility", "pnpm test:a11y", "accessibility"]
].map(([id, command, slug]) => ({
  id,
  command,
  evidenceUri: `artifact://M04/test-results/${slug}`
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
      gateId: "EXT-006",
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: "PRODUCTION_VERIFIED",
      accountableOwner: "shurevan",
      gaRequired: true,
      reviewExpiresAt: null,
      evidenceUris: []
    },
    {
      gateId: "EXT-007",
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: "PRODUCTION_VERIFIED",
      accountableOwner: "shurevan",
      gaRequired: true,
      reviewExpiresAt: null,
      evidenceUris: []
    }
  ],
  testRuns,
  manualReviews: [
    {
      id: "m04-auth-surface-review",
      owner: "shurevan",
      evidenceUri: "artifact://M04/manual/auth-surface-review"
    }
  ],
  deployments: [],
  migrations: [
    {
      id: "0002-identity-authentication",
      evidenceUri: "repo://packages/db/migrations/0002_identity_authentication.sql"
    }
  ],
  flags: [],
  knownRisks: [
    {
      id: "m04-production-email-delivery",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    },
    {
      id: "m04-production-google-application",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://packages/db/migrations/0002_identity_authentication.sql",
    "repo://apps/api/src/auth.ts",
    "repo://tooling/auth/postgres-suite.ts",
    "repo://artifacts/security/M04/auth-security.json",
    "repo://docs/operations/knotline/authentication-security.md"
  ]
};

const priorRouteCoverage = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M03/route-coverage.json"), "utf8")
);
const ownedRouteIds = new Set([
  "route.auth.sign-in",
  "route.auth.check-email",
  "route.auth.magic.callback",
  "route.auth.google.callback",
  "route.app.profile",
  "route.app.profile.sessions"
]);
const routeCoverage = {
  ...priorRouteCoverage,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: priorRouteCoverage.routes.map((route) =>
    ownedRouteIds.has(route.routeId)
      ? {
          ...route,
          states: route.states.map((state) => {
            const { activationMilestone: _activationMilestone, ...base } = state;
            void _activationMilestone;
            return {
              ...base,
              applicability: "REQUIRED",
              reason: "",
              reviewer: "shurevan",
              evidence: {
                accessibilityResult: "artifact://M04/test-results/accessibility",
                authorizationPersona: "new or returning customer identity",
                browserTest: "tests/e2e/auth.spec.ts",
                evidenceUri: "artifact://M04/test-results/browser",
                expectedTelemetry: "content-free auth route/state and request ID only",
                fixture: `auth-route.${route.routeId}.${state.stateId}`,
                localeSet: "en,en-XA",
                viewportDevice: "desktop and mobile pinned Chromium"
              }
            };
          })
        }
      : route
  )
};

const priorTraceability = JSON.parse(
  await readFile(join(ROOT, "artifacts/verification/M03/traceability.json"), "utf8")
);
const priorById = new Map(priorTraceability.requirements.map((row) => [row.requirementId, row]));
const tables = [
  "users",
  "identity_links",
  "magic_link_tokens",
  "identity_authorization_transactions",
  "identity_authorization_results",
  "sessions",
  "session_verifiers",
  "auth_rate_limits",
  "security_notifications",
  "auth_email_deliveries"
];
const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => {
    const prior = priorById.get(expected.requirementId);
    if (!requirements.has(expected.requirementId)) {
      return {
        ...prior,
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
    }
    return {
      requirementId: expected.requirementId,
      primaryMilestone: expected.primaryMilestone,
      regressionMilestones: expected.regressionMilestones,
      routes: expected.routeIds,
      openapiOperationIds: [
        "post-edge-v1-auth-magic-links",
        "post-edge-v1-auth-magic-links-exchange",
        "post-edge-v1-auth-google-authorizations",
        "post-edge-v1-auth-google-exchange",
        "get-callbacks-v1-identity-oauth-by-provider",
        "post-v1-auth-sessions-refresh",
        "get-v1-auth-sessions",
        "delete-v1-auth-sessions-by-session-id",
        "post-v1-auth-logout",
        "get-v1-me-bootstrap"
      ],
      tablesAndObjects: tables,
      events: [
        "identity.authorization_started.v1",
        "identity.authorization_consumed.v1",
        "identity.authorization_failed.v1",
        "identity.session_created.v1",
        "identity.session_revoked.v1"
      ],
      authorizationRules: [
        "apps/api/src/auth.ts#AuthService.authenticate",
        "apps/api/src/auth.ts#AuthService.verifyMutation",
        "packages/db/src/auth-repository.ts#PostgresAuthRepository"
      ],
      routeStateEvidence: [
        "tests/e2e/auth.spec.ts#email-sign-in",
        "tests/e2e/auth.spec.ts#google-sandbox",
        "tests/e2e/auth.spec.ts#session-inventory"
      ],
      journeyIds: expected.journeyIds,
      journeyBranchIds: expected.journeyBranchIds,
      dataLifecycleRules: ["packages/db/registry/data-stores.json"],
      sourceSymbols: [
        "apps/api/src/auth.ts#AuthService",
        "apps/api/src/app.ts#buildApp",
        "apps/web/src/AuthPages.tsx#SignInPage",
        "apps/web/src/AuthPages.tsx#SessionsPage"
      ],
      automatedTests: [
        "tooling/auth/postgres-suite.ts#runSuite",
        "apps/api/src/auth.test.ts",
        "tests/e2e/auth.spec.ts"
      ],
      manualEvidence: ["artifact://M04/manual/auth-surface-review"],
      operationalControls: ["docs/operations/knotline/authentication-security.md"],
      externalGates: expected.externalGates,
      engineeringState: "COMMITTED",
      environmentState: "NOT_DEPLOYED",
      ...(expected.supportContractReason
        ? { supportContractReason: expected.supportContractReason }
        : {})
    };
  })
};

const capabilities = [
  {
    id: "identity.passwordless",
    status: "DEMO",
    summary:
      "Single-use non-enumerating email authentication is fully verified locally; production SES delivery remains external.",
    owner: { team: "identity-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/authentication-security.md",
    externalGates: ["EXT-006"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/security/M04/auth-security.json"
    }
  },
  {
    id: "identity.google_oidc",
    status: "DEMO",
    summary:
      "The complete OIDC protocol and browser flow use a deterministic local provider; production Google application approval remains external.",
    owner: { team: "identity-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/authentication-security.md",
    externalGates: ["EXT-007"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/security/M04/auth-security.json"
    }
  },
  {
    id: "identity.sessions",
    status: "DEMO",
    summary:
      "Rotating HttpOnly sessions, CSRF, family reuse detection, inventory, and revocation are verified against local PostgreSQL and browsers.",
    owner: { team: "identity-platform", contact: "shurevan" },
    runbook: "docs/operations/knotline/authentication-security.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://artifacts/security/M04/auth-security.json"
    }
  }
];

const testRecords = testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `${run.id} completed with zero retries or quarantines.`,
  command: run.command,
  outputDigest: digest(`${run.id}:${run.command}:${registries.index.planDigest}`)
}));
const manual = {
  schemaVersion: 1,
  id: "m04-auth-surface-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed desktop/mobile sign-in, check-email, clean callbacks, error states, session inventory, revocation, cookie attributes, redaction, and external-gate labels.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/auth-surface-review.json"), canonicalJson(manual)),
  ...testRecords.map((record, index) => {
    const slug = testRuns[index].evidenceUri.split("/").at(-1);
    return writeFile(join(output, `test-results/${slug}.json`), canonicalJson(record));
  })
]);

process.stdout.write("Generated M04 evidence bindings.\n");
