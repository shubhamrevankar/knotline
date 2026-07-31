#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRegistries,
  canonicalJson,
  PLAN_PATH,
  ROOT,
  sha256
} from "../quality/plan-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const ENGINEERING_STATES = new Set(["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "COMMITTED"]);
const ENVIRONMENT_STATES = new Set(["NOT_DEPLOYED", "STAGING_VERIFIED", "PRODUCTION_VERIFIED"]);
const EXTERNAL_STATES = new Set([
  "NOT_APPLICABLE",
  "BLOCKED_EXTERNAL",
  "SIMULATED",
  "SANDBOX_VERIFIED",
  "PRODUCTION_VERIFIED"
]);
const CAPABILITY_STATES = new Set(["LIVE", "BETA", "DEMO", "PLANNED"]);
const TRACE_ARRAYS = [
  "routes",
  "openapiOperationIds",
  "tablesAndObjects",
  "events",
  "authorizationRules",
  "routeStateEvidence",
  "journeyIds",
  "journeyBranchIds",
  "dataLifecycleRules",
  "sourceSymbols",
  "automatedTests",
  "manualEvidence",
  "operationalControls",
  "externalGates"
];

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function uniqueStrings(value, label) {
  const values = array(value, label).map((item, index) => string(item, `${label}[${index}]`));
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
  return values;
}

function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) fail(`${label}.${key} is required`);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(`${label}.${key} is not allowed`);
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} must be a sha256 digest`);
}

function assertInstant(value, label) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value)))
    fail(`${label} must be an RFC 3339 UTC instant`);
}

function deepHasKey(value, keyPattern) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, item]) => keyPattern.test(key) || deepHasKey(item, keyPattern)
  );
}

async function currentRegistries() {
  return buildRegistries(await readFile(PLAN_PATH, "utf8"));
}

export function declarationDigest(declaration) {
  return sha256(canonicalJson(declaration));
}

export function validateDeclaration(declaration, registries) {
  object(declaration, "declaration");
  if (deepHasKey(declaration, /source[^a-z0-9]*commit/i))
    fail("Pre-commit declaration must not contain a source-commit claim");
  exactKeys(
    declaration,
    [
      "schemaVersion",
      "milestone",
      "targetEngineeringState",
      "declaredEnvironmentState",
      "owners",
      "requirements",
      "activeGateRows",
      "notYetApplicable",
      "environmentGates",
      "externalGates",
      "testRuns",
      "manualReviews",
      "deployments",
      "migrations",
      "flags",
      "knownRisks",
      "evidenceUris"
    ],
    [],
    "declaration"
  );
  if (declaration.schemaVersion !== 1) fail("declaration.schemaVersion must be 1");
  const milestones = new Set(registries.milestones.entries.map(({ id }) => id));
  if (!milestones.has(declaration.milestone))
    fail(`Unknown declaration milestone ${declaration.milestone}`);
  if (!new Set(["VERIFIED", "COMMITTED"]).has(declaration.targetEngineeringState))
    fail("Invalid targetEngineeringState");
  if (!ENVIRONMENT_STATES.has(declaration.declaredEnvironmentState))
    fail("Invalid declaredEnvironmentState");
  if (uniqueStrings(declaration.owners, "declaration.owners").length === 0)
    fail("declaration.owners must name an accountable owner");
  const requirementIds = new Set(registries.requirements.entries.map(({ id }) => id));
  for (const id of uniqueStrings(declaration.requirements, "declaration.requirements"))
    if (!requirementIds.has(id)) fail(`Unknown declaration requirement ${id}`);
  const activeRows = uniqueStrings(declaration.activeGateRows, "declaration.activeGateRows");
  const milestoneNumber = Number(declaration.milestone.slice(1));
  const expectedActiveRows = registries.gateActivation.entries
    .filter(({ activationMilestones }) =>
      activationMilestones.some((id) => Number(id.slice(1)) <= milestoneNumber)
    )
    .map(({ capability }) => capability.toLowerCase())
    .sort();
  if (JSON.stringify([...activeRows].sort()) !== JSON.stringify(expectedActiveRows))
    fail(`activeGateRows drift for ${declaration.milestone}`);
  uniqueStrings(declaration.evidenceUris, "declaration.evidenceUris");

  const notYetApplicable = new Map();
  for (const [index, item] of array(
    declaration.notYetApplicable,
    "declaration.notYetApplicable"
  ).entries()) {
    object(item, `declaration.notYetApplicable[${index}]`);
    exactKeys(
      item,
      ["row", "activationMilestone", "reason"],
      [],
      `declaration.notYetApplicable[${index}]`
    );
    string(item.row, "notYetApplicable.row");
    string(item.reason, "notYetApplicable.reason");
    if (!milestones.has(item.activationMilestone))
      fail(`Unknown activation milestone ${item.activationMilestone}`);
    const normalizedRow = item.row.toLowerCase();
    if (notYetApplicable.has(normalizedRow)) fail(`Duplicate not-yet-applicable row ${item.row}`);
    notYetApplicable.set(normalizedRow, item.activationMilestone);
  }
  const expectedNotYetApplicable = new Map(
    registries.gateActivation.entries
      .filter(
        ({ activationMilestones }) =>
          !activationMilestones.some((id) => Number(id.slice(1)) <= milestoneNumber)
      )
      .map(({ capability, activationMilestones }) => [
        capability.toLowerCase(),
        [...activationMilestones].sort(
          (left, right) => Number(left.slice(1)) - Number(right.slice(1))
        )[0]
      ])
  );
  if (notYetApplicable.size !== expectedNotYetApplicable.size)
    fail(`notYetApplicable row count drift for ${declaration.milestone}`);
  for (const [row, activationMilestone] of expectedNotYetApplicable) {
    if (notYetApplicable.get(row) !== activationMilestone)
      fail(`notYetApplicable activation drift for ${row}`);
  }

  const expectedCriteria = registries.criteria.entries.filter(
    ({ milestone }) => milestone === declaration.milestone
  );
  const actualCriteria = array(declaration.environmentGates, "declaration.environmentGates");
  if (actualCriteria.length !== expectedCriteria.length)
    fail(
      `Milestone ${declaration.milestone} must declare all ${expectedCriteria.length} environment criteria`
    );
  const expectedById = new Map(expectedCriteria.map((item) => [item.criterionId, item]));
  const criterionIds = new Set();
  for (const [index, item] of actualCriteria.entries()) {
    object(item, `environmentGates[${index}]`);
    exactKeys(
      item,
      [
        "criterionId",
        "sourceBulletDigest",
        "requiredTerminalState",
        "actualState",
        "environmentId",
        "evidenceUris"
      ],
      [],
      `environmentGates[${index}]`
    );
    if (criterionIds.has(item.criterionId))
      fail(`Duplicate environment criterion ${item.criterionId}`);
    criterionIds.add(item.criterionId);
    const expected = expectedById.get(item.criterionId);
    if (!expected) fail(`Unknown environment criterion ${item.criterionId}`);
    if (item.sourceBulletDigest !== expected.sourceBulletDigest)
      fail(`Stale source bullet digest for ${item.criterionId}`);
    if (item.requiredTerminalState !== expected.requiredTerminalState)
      fail(`Terminal-state drift for ${item.criterionId}`);
    if (![...ENVIRONMENT_STATES, "NOT_APPLICABLE"].includes(item.actualState))
      fail(`Invalid actual environment state for ${item.criterionId}`);
    const uris = uniqueStrings(item.evidenceUris, `${item.criterionId}.evidenceUris`);
    if (item.actualState !== "NOT_DEPLOYED" && item.actualState !== "NOT_APPLICABLE") {
      string(item.environmentId, `${item.criterionId}.environmentId`);
      if (uris.length === 0)
        fail(`Verified environment criterion ${item.criterionId} lacks evidence`);
    } else if (item.environmentId !== null)
      fail(`${item.criterionId}.environmentId must be null before verification`);
  }

  const gates = new Map(registries.externalGates.entries.map((item) => [item.id, item]));
  const externalIds = new Set();
  for (const [index, item] of array(
    declaration.externalGates,
    "declaration.externalGates"
  ).entries()) {
    object(item, `externalGates[${index}]`);
    exactKeys(
      item,
      [
        "gateId",
        "state",
        "requiredTerminalState",
        "accountableOwner",
        "gaRequired",
        "reviewExpiresAt",
        "evidenceUris"
      ],
      [],
      `externalGates[${index}]`
    );
    const expected = gates.get(item.gateId);
    if (!expected) fail(`Unknown external gate ${item.gateId}`);
    if (externalIds.has(item.gateId)) fail(`Duplicate external gate ${item.gateId}`);
    externalIds.add(item.gateId);
    if (!EXTERNAL_STATES.has(item.state) || !EXTERNAL_STATES.has(item.requiredTerminalState))
      fail(`Invalid external gate state for ${item.gateId}`);
    if (item.requiredTerminalState !== expected.requiredTerminalState)
      fail(`Required terminal-state drift for ${item.gateId}`);
    string(item.accountableOwner, `${item.gateId}.accountableOwner`);
    if (typeof item.gaRequired !== "boolean") fail(`${item.gateId}.gaRequired must be boolean`);
    if (item.reviewExpiresAt !== null)
      assertInstant(item.reviewExpiresAt, `${item.gateId}.reviewExpiresAt`);
    const uris = uniqueStrings(item.evidenceUris, `${item.gateId}.evidenceUris`);
    if (["SANDBOX_VERIFIED", "PRODUCTION_VERIFIED"].includes(item.state) && uris.length === 0)
      fail(`Verified external gate ${item.gateId} lacks evidence`);
  }

  const runIds = new Set();
  for (const [index, item] of array(declaration.testRuns, "declaration.testRuns").entries()) {
    object(item, `declaration.testRuns[${index}]`);
    exactKeys(item, ["id", "command", "evidenceUri"], [], `declaration.testRuns[${index}]`);
    if (runIds.has(item.id)) fail(`Duplicate test run ${item.id}`);
    runIds.add(string(item.id, "testRun.id"));
    string(item.command, `${item.id}.command`);
    string(item.evidenceUri, `${item.id}.evidenceUri`);
  }
  const reviewIds = new Set();
  for (const [index, item] of array(
    declaration.manualReviews,
    "declaration.manualReviews"
  ).entries()) {
    object(item, `declaration.manualReviews[${index}]`);
    exactKeys(item, ["id", "owner", "evidenceUri"], [], `declaration.manualReviews[${index}]`);
    if (reviewIds.has(item.id)) fail(`Duplicate manual review ${item.id}`);
    reviewIds.add(string(item.id, "manualReview.id"));
    string(item.owner, `${item.id}.owner`);
    string(item.evidenceUri, `${item.id}.evidenceUri`);
  }
  for (const name of ["deployments", "migrations", "flags"]) {
    for (const [index, item] of array(declaration[name], `declaration.${name}`).entries()) {
      object(item, `declaration.${name}[${index}]`);
      string(item.id, `${name}[${index}].id`);
      string(item.evidenceUri, `${name}[${index}].evidenceUri`);
    }
  }
  for (const [index, item] of array(declaration.knownRisks, "declaration.knownRisks").entries()) {
    object(item, `declaration.knownRisks[${index}]`);
    exactKeys(
      item,
      ["id", "owner", "status", "evidenceUri"],
      [],
      `declaration.knownRisks[${index}]`
    );
    for (const key of ["id", "owner", "status", "evidenceUri"])
      string(item[key], `knownRisks[${index}].${key}`);
  }
  return declaration;
}

export function validateManifest(manifest, declaration) {
  object(manifest, "manifest");
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "milestone",
      "declarationDigest",
      "sourceCommit",
      "workflowId",
      "jobId",
      "startedAt",
      "endedAt",
      "artifactDigests",
      "imageDigests",
      "sbomDigests",
      "provenanceDigests",
      "testResults",
      "deployments",
      "reviewerAttestations",
      "evidenceUris",
      "signature"
    ],
    [],
    "manifest"
  );
  if (manifest.schemaVersion !== 1) fail("manifest.schemaVersion must be 1");
  if (manifest.milestone !== declaration.milestone) fail("Manifest/declaration milestone mismatch");
  if (manifest.declarationDigest !== declarationDigest(declaration))
    fail("Stale declaration digest in post-commit manifest");
  if (typeof manifest.sourceCommit !== "string" || !COMMIT.test(manifest.sourceCommit))
    fail("manifest.sourceCommit must be a full immutable commit SHA");
  if (manifest.sourceCommit === manifest.declarationDigest.slice(7))
    fail("Manifest cannot use its declaration digest as sourceCommit");
  string(manifest.workflowId, "manifest.workflowId");
  string(manifest.jobId, "manifest.jobId");
  assertInstant(manifest.startedAt, "manifest.startedAt");
  assertInstant(manifest.endedAt, "manifest.endedAt");
  if (Date.parse(manifest.endedAt) < Date.parse(manifest.startedAt))
    fail("manifest.endedAt precedes startedAt");
  const digests = object(manifest.artifactDigests, "manifest.artifactDigests");
  if (Object.keys(digests).length === 0) fail("manifest.artifactDigests must not be empty");
  for (const [name, digest] of Object.entries(digests))
    assertDigest(digest, `manifest.artifactDigests.${name}`);
  for (const name of ["imageDigests", "sbomDigests", "provenanceDigests"]) {
    const values = object(manifest[name], `manifest.${name}`);
    if (Object.keys(values).length === 0) fail(`manifest.${name} must not be empty`);
    for (const [key, digest] of Object.entries(values))
      assertDigest(digest, `manifest.${name}.${key}`);
  }
  const resultIds = new Set();
  for (const [index, result] of array(manifest.testResults, "manifest.testResults").entries()) {
    object(result, `manifest.testResults[${index}]`);
    exactKeys(
      result,
      ["id", "status", "evidenceUri"],
      ["artifactDigest", "durationMs"],
      `manifest.testResults[${index}]`
    );
    if (resultIds.has(result.id)) fail(`Duplicate manifest test result ${result.id}`);
    resultIds.add(string(result.id, `manifest.testResults[${index}].id`));
    if (result.status !== "PASS") fail(`Manifest test ${result.id} did not pass`);
    string(result.evidenceUri, `manifest.testResults[${index}].evidenceUri`);
    if (result.artifactDigest !== undefined)
      assertDigest(result.artifactDigest, `manifest.testResults[${index}].artifactDigest`);
    if (
      result.artifactDigest !== undefined &&
      !Object.values(digests).includes(result.artifactDigest)
    )
      fail(`Manifest test ${result.id} digest does not bind a declared artifact`);
    if (
      result.durationMs !== undefined &&
      (!Number.isSafeInteger(result.durationMs) || result.durationMs < 0)
    )
      fail(`manifest.testResults[${index}].durationMs must be a non-negative integer`);
  }
  if (resultIds.size === 0) fail("manifest.testResults must not be empty");
  if (uniqueStrings(manifest.evidenceUris, "manifest.evidenceUris").length === 0)
    fail("manifest.evidenceUris must not be empty");
  const deployments = uniqueStrings(manifest.deployments, "manifest.deployments");
  if (declaration.declaredEnvironmentState === "NOT_DEPLOYED" && deployments.length !== 0)
    fail("Undeployed declaration cannot claim deployment identifiers");
  if (declaration.declaredEnvironmentState !== "NOT_DEPLOYED" && deployments.length === 0)
    fail("Environment-verified declaration requires deployment identifiers");
  const reviewerIds = new Set();
  for (const [index, reviewer] of array(
    manifest.reviewerAttestations,
    "manifest.reviewerAttestations"
  ).entries()) {
    object(reviewer, `manifest.reviewerAttestations[${index}]`);
    exactKeys(
      reviewer,
      ["id", "reviewer", "evidenceUri", "artifactDigest"],
      [],
      `manifest.reviewerAttestations[${index}]`
    );
    const id = string(reviewer.id, `manifest.reviewerAttestations[${index}].id`);
    if (reviewerIds.has(id)) fail(`Duplicate reviewer attestation ${id}`);
    reviewerIds.add(id);
    string(reviewer.reviewer, `${id}.reviewer`);
    string(reviewer.evidenceUri, `${id}.evidenceUri`);
    assertDigest(reviewer.artifactDigest, `${id}.artifactDigest`);
  }
  if (reviewerIds.size === 0) fail("manifest.reviewerAttestations must not be empty");
  const signature = object(manifest.signature, "manifest.signature");
  exactKeys(
    signature,
    ["algorithm", "identity", "bundleUri", "bundleDigest"],
    [],
    "manifest.signature"
  );
  if (signature.algorithm !== "sigstore") fail("manifest.signature.algorithm must be sigstore");
  string(signature.identity, "manifest.signature.identity");
  string(signature.bundleUri, "manifest.signature.bundleUri");
  assertDigest(signature.bundleDigest, "manifest.signature.bundleDigest");
  return manifest;
}

function stateId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateRouteCoverage(document, registries) {
  object(document, "routeCoverage");
  exactKeys(
    document,
    ["schemaVersion", "milestone", "planDigest", "routeRegistryDigest", "routes"],
    [],
    "routeCoverage"
  );
  if (document.schemaVersion !== 1) fail("routeCoverage.schemaVersion must be 1");
  if (document.planDigest !== registries.index.planDigest) fail("Stale route coverage plan digest");
  const routeIndexEntry = registries.index.entries.find(({ name }) => name === "routes");
  if (document.routeRegistryDigest !== routeIndexEntry.digest) fail("Stale route registry digest");
  const routes = new Map(registries.routes.entries.map((item) => [item.id, item]));
  const milestoneIds = new Set(registries.milestones.entries.map(({ id }) => id));
  if (!milestoneIds.has(document.milestone))
    fail(`Unknown route coverage milestone ${document.milestone}`);
  const classes = new Map(registries.routeStates.entries.map((item) => [item.routeClass, item]));
  const seen = new Set();
  for (const [routeIndex, routeCoverage] of array(
    document.routes,
    "routeCoverage.routes"
  ).entries()) {
    object(routeCoverage, `routeCoverage.routes[${routeIndex}]`);
    exactKeys(routeCoverage, ["routeId", "states"], [], `routeCoverage.routes[${routeIndex}]`);
    const route = routes.get(routeCoverage.routeId);
    if (!route) fail(`Unknown route coverage ID ${routeCoverage.routeId}`);
    if (seen.has(route.id)) fail(`Duplicate route coverage ID ${route.id}`);
    seen.add(route.id);
    const matrix = classes.get(route.routeClass);
    const expected = new Map([
      ...matrix.alwaysRequired.map((value) => [stateId(value), "ALWAYS_REQUIRED"]),
      ...matrix.conditional.map((value) => [stateId(value), "CONDITIONAL"]),
      ...matrix.normallyNotApplicable.map((value) => [stateId(value), "NORMALLY_NOT_APPLICABLE"])
    ]);
    const stateSeen = new Set();
    for (const [index, cell] of array(routeCoverage.states, `${route.id}.states`).entries()) {
      object(cell, `${route.id}.states[${index}]`);
      exactKeys(
        cell,
        ["stateId", "applicability", "reason", "reviewer", "evidence"],
        ["activationMilestone"],
        `${route.id}.states[${index}]`
      );
      const category = expected.get(cell.stateId);
      if (!category) fail(`Unknown state ${cell.stateId} for ${route.id}`);
      if (stateSeen.has(cell.stateId)) fail(`Duplicate state ${cell.stateId} for ${route.id}`);
      stateSeen.add(cell.stateId);
      if (!["REQUIRED", "NOT_APPLICABLE", "NOT_YET_APPLICABLE"].includes(cell.applicability))
        fail(`Unclassified state ${cell.stateId} for ${route.id}`);
      const routeInactive =
        Number(route.ownerMilestone.slice(1)) > Number(document.milestone.slice(1));
      if (
        category === "ALWAYS_REQUIRED" &&
        cell.applicability !== "REQUIRED" &&
        !(routeInactive && cell.applicability === "NOT_YET_APPLICABLE")
      )
        fail(`Always-required state ${cell.stateId} cannot be ${cell.applicability}`);
      if (cell.applicability === "NOT_YET_APPLICABLE") {
        if (!routeInactive)
          fail(`Active route ${route.id} cannot mark ${cell.stateId} NOT_YET_APPLICABLE`);
        if (cell.activationMilestone !== route.ownerMilestone)
          fail(`Activation milestone drift for ${route.id}.${cell.stateId}`);
      } else if ("activationMilestone" in cell)
        fail(`Only NOT_YET_APPLICABLE cells may declare activationMilestone`);
      string(cell.reviewer, `${route.id}.${cell.stateId}.reviewer`);
      if (cell.applicability !== "REQUIRED")
        string(cell.reason, `${route.id}.${cell.stateId}.reason`);
      const evidence = object(cell.evidence, `${route.id}.${cell.stateId}.evidence`);
      if (cell.applicability === "REQUIRED") {
        for (const key of [
          "fixture",
          "browserTest",
          "accessibilityResult",
          "localeSet",
          "viewportDevice",
          "authorizationPersona",
          "expectedTelemetry",
          "evidenceUri"
        ])
          string(evidence[key], `${route.id}.${cell.stateId}.evidence.${key}`);
      } else if (Object.keys(evidence).length !== 0)
        fail(`Non-required state ${cell.stateId} must not claim evidence`);
    }
    if (stateSeen.size !== expected.size) fail(`Unclassified route-state cell for ${route.id}`);
  }
  if (seen.size !== routes.size)
    fail(`Route coverage is incomplete: expected ${routes.size}, found ${seen.size}`);
  return document;
}

const EVIDENCE_ARRAY_BY_FAMILY = {
  UT: "automatedTests",
  PT: "automatedTests",
  DB: "automatedTests",
  API: "automatedTests",
  EVT: "automatedTests",
  E2E: "automatedTests",
  A11Y: "routeStateEvidence",
  SEC: "automatedTests",
  PROV: "externalGates",
  EVAL: "automatedTests",
  PERF: "automatedTests",
  OPS: "operationalControls",
  PRIV: "dataLifecycleRules",
  FIN: "automatedTests",
  MAN: "manualEvidence"
};

export function validateTraceability(document, registries) {
  object(document, "traceability");
  exactKeys(
    document,
    ["schemaVersion", "planDigest", "traceabilityRegistryDigest", "requirements"],
    [],
    "traceability"
  );
  if (document.schemaVersion !== 1) fail("traceability.schemaVersion must be 1");
  if (document.planDigest !== registries.index.planDigest) fail("Stale traceability plan digest");
  const registryDigest = registries.index.entries.find(
    ({ name }) => name === "traceability"
  ).digest;
  if (document.traceabilityRegistryDigest !== registryDigest)
    fail("Stale traceability registry digest");
  const expectedRows = new Map(
    registries.traceability.entries.map((item) => [item.requirementId, item])
  );
  const routeIds = new Set(registries.routes.entries.map(({ id }) => id));
  const apiIds = new Set(registries.api.entries.map(({ id }) => id));
  const journeyIds = new Set(registries.journeys.entries.map(({ id }) => id));
  const gateIds = new Set(registries.externalGates.entries.map(({ id }) => id));
  const seen = new Set();
  for (const [index, row] of array(document.requirements, "traceability.requirements").entries()) {
    object(row, `traceability.requirements[${index}]`);
    exactKeys(
      row,
      [
        "requirementId",
        "primaryMilestone",
        "regressionMilestones",
        ...TRACE_ARRAYS,
        "engineeringState",
        "environmentState"
      ],
      ["supportContractReason"],
      `traceability.requirements[${index}]`
    );
    const expected = expectedRows.get(row.requirementId);
    if (!expected) fail(`Unknown traceability requirement ${row.requirementId}`);
    if (seen.has(row.requirementId))
      fail(`Duplicate traceability requirement ${row.requirementId}`);
    seen.add(row.requirementId);
    if (row.primaryMilestone !== expected.primaryMilestone)
      fail(`Primary owner drift for ${row.requirementId}`);
    if (
      !ENGINEERING_STATES.has(row.engineeringState) ||
      !ENVIRONMENT_STATES.has(row.environmentState)
    )
      fail(`Invalid state for ${row.requirementId}`);
    uniqueStrings(row.regressionMilestones, `${row.requirementId}.regressionMilestones`);
    for (const name of TRACE_ARRAYS) uniqueStrings(row[name], `${row.requirementId}.${name}`);
    for (const id of row.routes)
      if (!routeIds.has(id)) fail(`Unknown route ${id} on ${row.requirementId}`);
    for (const id of row.openapiOperationIds)
      if (!apiIds.has(id)) fail(`Unknown API operation ${id} on ${row.requirementId}`);
    for (const id of [...row.journeyIds, ...row.journeyBranchIds])
      if (!journeyIds.has(id)) fail(`Unknown journey ${id} on ${row.requirementId}`);
    for (const id of row.externalGates)
      if (!gateIds.has(id)) fail(`Unknown external gate ${id} on ${row.requirementId}`);
    if (
      row.routes.length === 0 &&
      row.openapiOperationIds.length === 0 &&
      row.journeyIds.length === 0 &&
      row.journeyBranchIds.length === 0
    )
      string(row.supportContractReason, `${row.requirementId}.supportContractReason`);
    if (row.engineeringState === "COMMITTED") {
      for (const family of expected.evidenceFamilies) {
        const field = EVIDENCE_ARRAY_BY_FAMILY[family];
        if (field && row[field].length === 0)
          fail(`Committed ${row.requirementId} lacks ${family} evidence in ${field}`);
      }
    }
  }
  if (seen.size !== expectedRows.size)
    fail(`Traceability is incomplete: expected ${expectedRows.size}, found ${seen.size}`);
  return document;
}

export function validateExternalGateLedger(document, registries, now = new Date()) {
  object(document, "externalGateLedger");
  exactKeys(document, ["schemaVersion", "planDigest", "gates"], [], "externalGateLedger");
  if (document.schemaVersion !== 1 || document.planDigest !== registries.index.planDigest)
    fail("External gate ledger is stale");
  const expected = new Map(registries.externalGates.entries.map((item) => [item.id, item]));
  const seen = new Set();
  for (const row of array(document.gates, "externalGateLedger.gates")) {
    object(row, "externalGateLedger.gate");
    exactKeys(
      row,
      [
        "gateId",
        "state",
        "requiredTerminalState",
        "accountableOwner",
        "gaRequired",
        "reviewExpiresAt",
        "evidenceUris"
      ],
      [
        "scopeAmendmentId",
        "targetEnvironment",
        "accountId",
        "applicationId",
        "requestedScopes",
        "commercialTier",
        "region",
        "contractReference",
        "costApproval",
        "issuedAt"
      ],
      "externalGateLedger.gate"
    );
    const source = expected.get(row.gateId);
    if (!source) fail(`Unknown external gate ${row.gateId}`);
    if (seen.has(row.gateId)) fail(`Duplicate external gate ${row.gateId}`);
    seen.add(row.gateId);
    if (!EXTERNAL_STATES.has(row.state)) fail(`Invalid external state ${row.state}`);
    if (row.requiredTerminalState !== source.requiredTerminalState)
      fail(`Terminal-state drift for ${row.gateId}`);
    string(row.accountableOwner, `${row.gateId}.accountableOwner`);
    if (typeof row.gaRequired !== "boolean") fail(`${row.gateId}.gaRequired must be boolean`);
    const evidence = uniqueStrings(row.evidenceUris, `${row.gateId}.evidenceUris`);
    if (["SANDBOX_VERIFIED", "PRODUCTION_VERIFIED"].includes(row.state)) {
      if (evidence.length === 0) fail(`Verified gate ${row.gateId} lacks evidence`);
      assertInstant(row.reviewExpiresAt, `${row.gateId}.reviewExpiresAt`);
      if (Date.parse(row.reviewExpiresAt) <= now.getTime())
        fail(`External gate ${row.gateId} evidence is expired`);
    }
    // Nonterminal required gates remain valid, explicit blockers in the ledger.
  }
  if (seen.size !== expected.size)
    fail(`External gate ledger is incomplete: expected ${expected.size}, found ${seen.size}`);
  return document;
}

export function validateCapabilities(document, externalGateLedger) {
  const gates = new Map((externalGateLedger?.gates ?? []).map((item) => [item.gateId, item]));
  const ids = new Set();
  for (const capability of array(document, "capabilities")) {
    object(capability, "capability");
    exactKeys(
      capability,
      ["id", "status", "summary", "owner", "runbook", "externalGates"],
      ["evidence"],
      "capability"
    );
    if (ids.has(capability.id)) fail(`Duplicate capability ${capability.id}`);
    ids.add(string(capability.id, "capability.id"));
    if (!CAPABILITY_STATES.has(capability.status))
      fail(`Invalid capability status ${capability.status}`);
    string(capability.summary, `${capability.id}.summary`);
    const owner = object(capability.owner, `${capability.id}.owner`);
    exactKeys(owner, ["team", "contact"], [], `${capability.id}.owner`);
    string(owner.team, `${capability.id}.owner.team`);
    string(owner.contact, `${capability.id}.owner.contact`);
    string(capability.runbook, `${capability.id}.runbook`);
    const externalIds = uniqueStrings(capability.externalGates, `${capability.id}.externalGates`);
    const evidence =
      capability.evidence === undefined
        ? undefined
        : object(capability.evidence, `${capability.id}.evidence`);
    if (evidence) {
      exactKeys(
        evidence,
        ["environment", "verifiedAt", "reference"],
        [],
        `${capability.id}.evidence`
      );
      if (!["local", "development", "staging", "production"].includes(evidence.environment))
        fail(`Invalid capability evidence environment for ${capability.id}`);
      assertInstant(evidence.verifiedAt, `${capability.id}.evidence.verifiedAt`);
      string(evidence.reference, `${capability.id}.evidence.reference`);
    }
    if (capability.status === "LIVE") {
      if (evidence?.environment !== "production")
        fail(`LIVE capability ${capability.id} lacks production evidence`);
      for (const gateId of externalIds)
        if (gates.get(gateId)?.state !== "PRODUCTION_VERIFIED")
          fail(`LIVE capability ${capability.id} has unverified gate ${gateId}`);
    }
    if (capability.status === "BETA" && !["staging", "production"].includes(evidence?.environment))
      fail(`BETA capability ${capability.id} lacks environment verification`);
    if (capability.status === "PLANNED" && evidence)
      fail(`PLANNED capability ${capability.id} cannot claim evidence`);
  }
  return document;
}

async function filesBelow(directory) {
  const result = [];
  for (const name of await readdir(directory).catch(() => [])) {
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) result.push(...(await filesBelow(path)));
    else result.push(path);
  }
  return result;
}

function artifactPathFromUri(uri) {
  const match = /^artifact:\/\/([A-Z]\d{2})\/([a-z0-9/_-]+)$/u.exec(uri);
  if (!match) fail(`Invalid artifact evidence URI ${uri}`);
  return join(ROOT, "artifacts", "verification", match[1], `${match[2]}.json`);
}

async function validateDeclaredArtifact(record, expectedKind) {
  const path = artifactPathFromUri(record.evidenceUri);
  const artifact = object(
    JSON.parse(
      await readFile(path, "utf8").catch(() =>
        fail(`Missing declared artifact evidence ${record.evidenceUri}`)
      )
    ),
    record.evidenceUri
  );
  exactKeys(
    artifact,
    ["schemaVersion", "id", "kind", "status", "recordedAt", "summary"],
    ["command", "owner", "outputDigest"],
    record.evidenceUri
  );
  if (artifact.schemaVersion !== 1 || artifact.id !== record.id || artifact.kind !== expectedKind)
    fail(`Declared artifact identity mismatch for ${record.evidenceUri}`);
  if (artifact.status !== "PASS") fail(`Declared artifact did not pass: ${record.evidenceUri}`);
  assertInstant(artifact.recordedAt, `${record.evidenceUri}.recordedAt`);
  string(artifact.summary, `${record.evidenceUri}.summary`);
  if (expectedKind === "test") {
    if (artifact.command !== record.command)
      fail(`Artifact command mismatch for ${record.evidenceUri}`);
    assertDigest(artifact.outputDigest, `${record.evidenceUri}.outputDigest`);
  } else if (artifact.owner !== record.owner) {
    fail(`Artifact owner mismatch for ${record.evidenceUri}`);
  }
}

function byteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseBundleDocuments(bundleBytes) {
  const source = bundleBytes.toString("utf8").trim();
  if (!source) fail("Sigstore bundle must not be empty");
  try {
    return [JSON.parse(source)];
  } catch {
    try {
      return source
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      fail("Sigstore bundle must be valid JSON or JSONL");
    }
  }
}

function dsseBundles(document) {
  const candidates = [];
  const append = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (value.dsseEnvelope) candidates.push(value);
    else if (value.bundle?.dsseEnvelope) candidates.push(value.bundle);
  };
  if (Array.isArray(document)) for (const item of document) append(item);
  else {
    append(document);
    if (Array.isArray(document?.bundles)) for (const item of document.bundles) append(item);
  }
  return candidates;
}

function decodeDsseStatement(bundle) {
  const envelope = object(bundle.dsseEnvelope, "sigstoreBundle.dsseEnvelope");
  if (envelope.payloadType !== "application/vnd.in-toto+json")
    fail("Sigstore DSSE payloadType must be application/vnd.in-toto+json");
  const payload = string(envelope.payload, "sigstoreBundle.dsseEnvelope.payload");
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(payload)) fail("Sigstore DSSE payload is not base64");
  const signatures = array(envelope.signatures, "sigstoreBundle.dsseEnvelope.signatures");
  if (signatures.length === 0) fail("Sigstore DSSE envelope has no signatures");
  for (const [index, signature] of signatures.entries()) {
    object(signature, `sigstoreBundle.dsseEnvelope.signatures[${index}]`);
    string(signature.sig, `sigstoreBundle.dsseEnvelope.signatures[${index}].sig`);
  }
  object(bundle.verificationMaterial, "sigstoreBundle.verificationMaterial");
  try {
    return object(JSON.parse(Buffer.from(payload, "base64").toString("utf8")), "in-toto statement");
  } catch (error) {
    if (error instanceof SyntaxError) fail("Sigstore DSSE payload is not a JSON in-toto statement");
    throw error;
  }
}

export function validateSigstoreBundleBinding(manifest, bundleBytes) {
  if (byteDigest(bundleBytes) !== manifest.signature?.bundleDigest)
    fail("Sigstore bundle digest does not match manifest signature");
  const unsigned = { ...manifest };
  delete unsigned.signature;
  const subjectHex = byteDigest(Buffer.from(canonicalJson(unsigned), "utf8")).slice(
    "sha256:".length
  );
  const allowedNames = new Set([
    "unsigned-manifest.json",
    "artifacts/attestation/unsigned-manifest.json"
  ]);
  const bundles = parseBundleDocuments(bundleBytes).flatMap(dsseBundles);
  if (bundles.length === 0) fail("Sigstore bundle has no standard DSSE envelope");
  const bound = bundles.some((bundle) => {
    const statement = decodeDsseStatement(bundle);
    if (statement._type !== "https://in-toto.io/Statement/v1")
      fail("Sigstore payload is not an in-toto Statement v1");
    return array(statement.subject, "in-toto statement.subject").some((subject, index) => {
      object(subject, `in-toto statement.subject[${index}]`);
      const name = string(subject.name, `in-toto statement.subject[${index}].name`);
      const digest = object(subject.digest, `in-toto statement.subject[${index}].digest`);
      return allowedNames.has(name) && digest.sha256 === subjectHex;
    });
  });
  if (!bound) fail("Sigstore DSSE subject is not bound to the canonical unsigned manifest");
  return true;
}

function verifyGitHubAttestation(subjectPath, bundlePath) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) fail("GITHUB_REPOSITORY is required for post-commit attestation verification");
  execFileSync(
    "gh",
    [
      "attestation",
      "verify",
      subjectPath,
      "--repo",
      repository,
      "--bundle",
      bundlePath,
      "--signer-workflow",
      `${repository}/.github/workflows/ci.yml`
    ],
    { stdio: "inherit" }
  );
}

export async function checkEvidence(
  directory = join(ROOT, "artifacts/verification"),
  options = {}
) {
  const registries = await currentRegistries();
  const files = await filesBelow(directory);
  for (const path of files.filter((item) => basename(item) === "declaration.json")) {
    validateDeclaration(JSON.parse(await readFile(path, "utf8")), registries);
  }
  const declarations = files.filter((item) => basename(item) === "declaration.json");
  if (declarations.length === 0) fail("Evidence store has no declaration.json");
  for (const path of declarations) {
    const siblingNames = new Set(
      files.filter((item) => dirname(item) === dirname(path)).map((item) => basename(item))
    );
    for (const required of ["route-coverage.json", "traceability.json", "capabilities.json"])
      if (!siblingNames.has(required))
        fail(`${relative(ROOT, dirname(path))} is missing ${required}`);
  }
  const manifests = files.filter((item) => basename(item) === "manifest.json");
  if (options.postcommit && manifests.length !== declarations.length)
    fail("Post-commit evidence requires one manifest.json per declaration.json");
  for (const path of manifests) {
    const declaration = JSON.parse(await readFile(join(dirname(path), "declaration.json"), "utf8"));
    const manifest = validateManifest(JSON.parse(await readFile(path, "utf8")), declaration);
    const bundlePath = join(dirname(path), "sigstore-bundle.json");
    const bundleBytes = await readFile(bundlePath).catch(() =>
      fail("Post-commit manifest lacks sigstore-bundle.json")
    );
    validateSigstoreBundleBinding(manifest, bundleBytes);
    if (options.postcommit) {
      const subjectPath = join(ROOT, "artifacts", "attestation", "unsigned-manifest.json");
      const subjectBytes = await readFile(subjectPath).catch(() =>
        fail("Post-commit verification lacks unsigned manifest subject")
      );
      const unsigned = { ...manifest };
      delete unsigned.signature;
      if (subjectBytes.toString("utf8") !== canonicalJson(unsigned))
        fail("Attested subject does not equal the canonical unsigned manifest");
      (options.verifyAttestation ?? verifyGitHubAttestation)(subjectPath, bundlePath);
    }
  }
  for (const path of files.filter((item) => basename(item) === "route-coverage.json"))
    validateRouteCoverage(JSON.parse(await readFile(path, "utf8")), registries);
  for (const path of files.filter((item) => basename(item) === "traceability.json"))
    validateTraceability(JSON.parse(await readFile(path, "utf8")), registries);
  const externalPaths = files.filter((item) => basename(item) === "external-gates.json");
  if (externalPaths.length !== 1)
    fail("Evidence store requires exactly one external-gates.json ledger");
  const externalLedger = JSON.parse(await readFile(externalPaths[0], "utf8"));
  validateExternalGateLedger(externalLedger, registries);
  for (const path of files.filter((item) => basename(item) === "capabilities.json"))
    validateCapabilities(JSON.parse(await readFile(path, "utf8")), externalLedger);
  for (const path of declarations) {
    const declaration = JSON.parse(await readFile(path, "utf8"));
    for (const record of declaration.testRuns) await validateDeclaredArtifact(record, "test");
    for (const record of declaration.manualReviews)
      await validateDeclaredArtifact(record, "manual");
    for (const uri of declaration.evidenceUris.filter((value) => value.startsWith("repo://"))) {
      const target = join(ROOT, uri.slice("repo://".length));
      await stat(target).catch(() => fail(`Missing repository evidence reference ${uri}`));
    }
  }
  return { checkedFiles: files.length, registries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? "check";
  if (!["check", "postcommit"].includes(command)) {
    process.stderr.write("Usage: node tooling/gate/evidence.mjs <check|postcommit> [directory]\n");
    process.exitCode = 1;
  } else {
    checkEvidence(process.argv[3] ? resolve(process.argv[3]) : undefined, {
      postcommit: command === "postcommit"
    })
      .then(({ checkedFiles }) => {
        process.stdout.write(`Evidence validation passed (${checkedFiles} files).\n`);
        return undefined;
      })
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}

export { HERE };
