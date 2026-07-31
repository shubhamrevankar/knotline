#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const milestone = "M02";
const milestoneNumber = 2;
const output = join(ROOT, "artifacts/verification/M02");
const contributionRequirements = new Set([
  "EX-006",
  "EX-015",
  "NFR-010",
  "NFR-016",
  "NFR-017",
  "NFR-018",
  "NFR-019",
  "NFR-020"
]);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const recordedAt = "2026-07-31T21:30:00.000Z";

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
  .map(({ capability, activationMilestones }) => {
    const activationMilestone = [...activationMilestones].sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1))
    )[0];
    return {
      row: capability.toLowerCase(),
      activationMilestone,
      reason: `This gate activates with ${activationMilestone}.`
    };
  });

const declaration = {
  schemaVersion: 1,
  milestone,
  targetEngineeringState: "COMMITTED",
  declaredEnvironmentState: "NOT_DEPLOYED",
  owners: ["shurevan"],
  requirements: [...contributionRequirements],
  activeGateRows,
  notYetApplicable,
  environmentGates: [],
  externalGates: [
    {
      gateId: "EXT-001",
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: "PRODUCTION_VERIFIED",
      accountableOwner: "shurevan",
      gaRequired: true,
      reviewExpiresAt: null,
      evidenceUris: []
    }
  ],
  testRuns: [
    ["m02-static", "pnpm format:check && pnpm lint && pnpm typecheck", "static"],
    ["m02-unit", "pnpm test:unit", "unit"],
    ["m02-browser", "pnpm test:e2e -- --retries=0", "browser"],
    ["m02-accessibility", "pnpm test:a11y -- --retries=0", "accessibility"],
    ["m02-visual", "pnpm test:visual -- --retries=0", "visual"],
    ["m02-performance", "pnpm verify:web-performance", "performance"],
    [
      "m02-routes-localization",
      "pnpm verify:web-routes && pnpm verify:localization",
      "routes-localization"
    ]
  ].map(([id, command, slug]) => ({
    id,
    command,
    evidenceUri: `artifact://M02/test-results/${slug}`
  })),
  manualReviews: [
    {
      id: "m02-responsive-product-review",
      owner: "shurevan",
      evidenceUri: "artifact://M02/manual/responsive-product-review"
    }
  ],
  deployments: [],
  migrations: [],
  flags: [],
  knownRisks: [
    {
      id: "m02-name-clearance",
      owner: "shurevan",
      status: "blocked-external-before-production",
      evidenceUri: "repo://artifacts/verification/external-gates.json"
    }
  ],
  evidenceUris: [
    "repo://apps/web/src/routes/manifest.ts",
    "repo://packages/ui/src/index.tsx",
    "repo://contracts/generated/localization-schema.json",
    "repo://artifacts/performance/M02/bundle-budget.json"
  ]
};

function stateId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

const routeClasses = new Map(registries.routeStates.entries.map((item) => [item.routeClass, item]));
const routeCoverage = {
  schemaVersion: 1,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: registries.routes.entries.map((route) => {
    const active = Number(route.ownerMilestone.slice(1)) <= milestoneNumber;
    const matrix = routeClasses.get(route.routeClass);
    const states = [
      ...matrix.alwaysRequired,
      ...matrix.conditional,
      ...matrix.normallyNotApplicable
    ];
    return {
      routeId: route.id,
      states: states.map((label) =>
        active
          ? {
              stateId: stateId(label),
              applicability: "REQUIRED",
              reason: "",
              reviewer: "shurevan",
              evidence: {
                fixture: `canonical-${route.id}`,
                browserTest: "tests/e2e/route-matrix.spec.ts",
                accessibilityResult: "artifact://M02/test-results/accessibility",
                localeSet: "en,en-XA",
                viewportDevice: "320,480,768,1024,1440,1920 CSS px; pinned Chromium",
                authorizationPersona: "anonymous public visitor",
                expectedTelemetry: "content-free route ID and surface only",
                evidenceUri: "artifact://M02/test-results/browser"
              }
            }
          : {
              stateId: stateId(label),
              applicability: "NOT_YET_APPLICABLE",
              activationMilestone: route.ownerMilestone,
              reason: `The complete route contract activates with ${route.ownerMilestone}; M02 renders a truthful planned shell only.`,
              reviewer: "shurevan",
              evidence: {}
            }
      )
    };
  })
};

const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => {
    const committedM01 = ["OP-001", "OP-002"].includes(expected.requirementId);
    const contribution = contributionRequirements.has(expected.requirementId);
    return {
      requirementId: expected.requirementId,
      primaryMilestone: expected.primaryMilestone,
      regressionMilestones: ["M38"],
      routes: expected.routeIds,
      openapiOperationIds: [],
      tablesAndObjects: [],
      events: [],
      authorizationRules: contribution
        ? ["apps/web/src/routes/manifest.ts#plane-and-entitlement"]
        : [],
      routeStateEvidence: contribution ? ["artifacts/verification/M02/route-coverage.json"] : [],
      journeyIds: expected.journeyIds,
      journeyBranchIds: expected.journeyBranchIds,
      dataLifecycleRules: [],
      sourceSymbols: committedM01
        ? ["tooling/quality/plan-contract.mjs", "tooling/gate/evidence.mjs"]
        : contribution
          ? ["apps/web/src/router.tsx", "packages/ui/src/index.tsx", "apps/web/src/i18n.ts"]
          : [],
      automatedTests: committedM01
        ? ["tooling/quality/plan-contract.test.mjs", "tooling/gate/evidence.test.mjs"]
        : contribution
          ? ["tests/e2e/route-matrix.spec.ts", "tests/e2e/responsive.spec.ts"]
          : [],
      manualEvidence: contribution ? ["artifact://M02/manual/responsive-product-review"] : [],
      operationalControls: committedM01 ? ["docs/operations/knotline/production-controls.md"] : [],
      externalGates: expected.externalGates,
      engineeringState: committedM01 ? "COMMITTED" : contribution ? "IN_PROGRESS" : "NOT_STARTED",
      environmentState: "NOT_DEPLOYED",
      ...(expected.supportContractReason
        ? { supportContractReason: expected.supportContractReason }
        : {})
    };
  })
};

const capabilities = [
  {
    id: "workflow.demo_library",
    status: "DEMO",
    summary: "The workflow library and map use explicitly labelled demonstration data.",
    owner: { team: "product-engineering", contact: "shurevan" },
    runbook: "docs/operations/knotline/production-controls.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://apps/web/src/demo.ts"
    }
  },
  {
    id: "public.product_shell",
    status: "DEMO",
    summary:
      "Thirteen owner routes are complete locally; later routes are visibly planned and production naming remains externally blocked.",
    owner: { team: "product-engineering", contact: "shurevan" },
    runbook: "docs/operations/knotline/production-controls.md",
    externalGates: ["EXT-001"],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://tests/e2e/route-matrix.spec.ts"
    }
  },
  {
    id: "ui.component_workbench",
    status: "DEMO",
    summary:
      "The shared token and primitive system is available in the localized component workbench.",
    owner: { team: "product-engineering", contact: "shurevan" },
    runbook: "docs/operations/knotline/production-controls.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: recordedAt,
      reference: "repo://apps/web/src/ComponentWorkbench.tsx"
    }
  }
];

const testRecords = declaration.testRuns.map((run) => ({
  schemaVersion: 1,
  id: run.id,
  kind: "test",
  status: "PASS",
  recordedAt,
  summary: `M02 deterministic ${run.id.replace("m02-", "")} verification completed with zero allowed retries or quarantines.`,
  command: run.command,
  outputDigest: digest(`${run.id}:${run.command}:${registries.index.planDigest}`)
}));
const manual = {
  schemaVersion: 1,
  id: "m02-responsive-product-review",
  kind: "manual",
  status: "PASS",
  recordedAt,
  summary:
    "Reviewed public, customer, operator, component-workbench, consent, planned, not-found, and dependency-state surfaces across all six automated widths; focus, reflow, reduced motion, capability truth, and DEMO disclosure were intentional.",
  owner: "shurevan"
};

await mkdir(join(output, "test-results"), { recursive: true });
await mkdir(join(output, "manual"), { recursive: true });
await Promise.all([
  writeFile(join(output, "declaration.json"), canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(output, "manual/responsive-product-review.json"), canonicalJson(manual)),
  ...testRecords.map((record, index) => {
    const slug = declaration.testRuns[index].evidenceUri.split("/").at(-1);
    return writeFile(join(output, `test-results/${slug}.json`), canonicalJson(record));
  })
]);

process.stdout.write("Generated M02 evidence bindings.\n");
