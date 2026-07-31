#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildRegistries, canonicalJson, PLAN_PATH, ROOT } from "../quality/plan-contract.mjs";

const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
const milestone = "M01";
const output = join(ROOT, "artifacts/verification/M01");
const declarationPath = join(output, "declaration.json");
const declaration = JSON.parse(await readFile(declarationPath, "utf8"));
declaration.activeGateRows = registries.gateActivation.entries
  .filter(({ activationMilestones }) => activationMilestones.some((id) => Number(id.slice(1)) <= 1))
  .map(({ capability }) => capability.toLowerCase());
declaration.notYetApplicable = registries.gateActivation.entries
  .filter(
    ({ activationMilestones }) => !activationMilestones.some((id) => Number(id.slice(1)) <= 1)
  )
  .map(({ capability, activationMilestones }) => ({
    row: capability.toLowerCase(),
    activationMilestone: [...activationMilestones].sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1))
    )[0],
    reason: `This gate activates with ${[...activationMilestones].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))[0]}.`
  }));

function stateId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const routeClasses = new Map(registries.routeStates.entries.map((item) => [item.routeClass, item]));
const routeCoverage = {
  schemaVersion: 1,
  milestone,
  planDigest: registries.index.planDigest,
  routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
  routes: registries.routes.entries.map((route) => {
    const matrix = routeClasses.get(route.routeClass);
    const states = [
      ...matrix.alwaysRequired,
      ...matrix.conditional,
      ...matrix.normallyNotApplicable
    ];
    return {
      routeId: route.id,
      states: states.map((label) => ({
        stateId: stateId(label),
        applicability: "NOT_YET_APPLICABLE",
        activationMilestone: route.ownerMilestone,
        reason: `The route contract activates with ${route.ownerMilestone}.`,
        reviewer: "shurevan",
        evidence: {}
      }))
    };
  })
};

const traceability = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
    .digest,
  requirements: registries.traceability.entries.map((expected) => {
    const implemented = ["OP-001", "OP-002"].includes(expected.requirementId);
    return {
      requirementId: expected.requirementId,
      primaryMilestone: expected.primaryMilestone,
      regressionMilestones: ["M38"],
      routes: expected.routeIds,
      openapiOperationIds: [],
      tablesAndObjects: [],
      events: [],
      authorizationRules: [],
      routeStateEvidence: [],
      journeyIds: expected.journeyIds,
      journeyBranchIds: expected.journeyBranchIds,
      dataLifecycleRules: [],
      sourceSymbols: implemented
        ? ["tooling/quality/plan-contract.mjs", "tooling/gate/evidence.mjs"]
        : [],
      automatedTests: implemented
        ? ["tooling/quality/plan-contract.test.mjs", "tooling/gate/evidence.test.mjs"]
        : [],
      manualEvidence: [],
      operationalControls: implemented ? ["docs/operations/knotline/production-controls.md"] : [],
      externalGates: expected.externalGates,
      engineeringState: implemented ? "COMMITTED" : "NOT_STARTED",
      environmentState: "NOT_DEPLOYED",
      ...(expected.supportContractReason
        ? { supportContractReason: expected.supportContractReason }
        : {})
    };
  })
};

const externalGates = {
  schemaVersion: 1,
  planDigest: registries.index.planDigest,
  gates: registries.externalGates.entries.map((gate) => ({
    gateId: gate.id,
    state: gate.id === "EXT-018" ? "NOT_APPLICABLE" : "BLOCKED_EXTERNAL",
    requiredTerminalState: gate.requiredTerminalState,
    accountableOwner: "shurevan",
    gaRequired: gate.gaPolicy === "REQUIRED",
    reviewExpiresAt: null,
    evidenceUris: []
  }))
};

const capabilities = [
  {
    id: "workflow.demo_library",
    status: "DEMO",
    summary: "M00 workflow library and map use explicitly labelled demonstration data.",
    owner: { team: "product-engineering", contact: "shurevan" },
    runbook: "docs/operations/knotline/production-controls.md",
    externalGates: [],
    evidence: {
      environment: "local",
      verifiedAt: "2026-07-31T00:00:00.000Z",
      reference: "repo://apps/web/src/demo.ts"
    }
  }
];

await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(declarationPath, canonicalJson(declaration)),
  writeFile(join(output, "route-coverage.json"), canonicalJson(routeCoverage)),
  writeFile(join(output, "traceability.json"), canonicalJson(traceability)),
  writeFile(join(output, "capabilities.json"), canonicalJson(capabilities)),
  writeFile(join(ROOT, "artifacts/verification/external-gates.json"), canonicalJson(externalGates))
]);

process.stdout.write("Generated M01 evidence bindings.\n");
