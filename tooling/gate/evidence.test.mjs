import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildRegistries,
  canonicalJson,
  PLAN_PATH,
  ROOT,
  sha256
} from "../quality/plan-contract.mjs";
import {
  declarationDigest,
  validateCapabilities,
  checkEvidence,
  validateDeclaration,
  validateExternalGateLedger,
  validateManifest,
  validateRouteCoverage,
  validateSigstoreBundleBinding,
  validateTraceability
} from "./evidence.mjs";

const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));

function declaration(milestone = "M01") {
  const environmentGates = registries.criteria.entries
    .filter((item) => item.milestone === milestone)
    .map((item) => ({
      criterionId: item.criterionId,
      sourceBulletDigest: item.sourceBulletDigest,
      requiredTerminalState: item.requiredTerminalState,
      actualState: "NOT_DEPLOYED",
      environmentId: null,
      evidenceUris: []
    }));
  const activeGateRows = registries.gateActivation.entries
    .filter(({ activationMilestones }) =>
      activationMilestones.some((id) => Number(id.slice(1)) <= Number(milestone.slice(1)))
    )
    .map(({ capability }) => capability.toLowerCase());
  const notYetApplicable = registries.gateActivation.entries
    .filter(
      ({ activationMilestones }) =>
        !activationMilestones.some((id) => Number(id.slice(1)) <= Number(milestone.slice(1)))
    )
    .map(({ capability, activationMilestones }) => ({
      row: capability.toLowerCase(),
      activationMilestone: [...activationMilestones].sort(
        (left, right) => Number(left.slice(1)) - Number(right.slice(1))
      )[0],
      reason: "The gate has not reached its activation milestone."
    }));
  return {
    schemaVersion: 1,
    milestone,
    targetEngineeringState: "COMMITTED",
    declaredEnvironmentState: "NOT_DEPLOYED",
    owners: ["shurevan"],
    requirements: [],
    activeGateRows,
    notYetApplicable,
    environmentGates,
    externalGates: [],
    testRuns: [],
    manualReviews: [],
    deployments: [],
    migrations: [],
    flags: [],
    knownRisks: [],
    evidenceUris: []
  };
}

test("accepts a pre-commit declaration and rejects source-commit claims", () => {
  validateDeclaration(declaration(), registries);
  assert.throws(
    () => validateDeclaration({ ...declaration(), sourceCommit: "a".repeat(40) }, registries),
    /source-commit claim/
  );
  assert.throws(
    () => validateDeclaration({ ...declaration(), source_commit: "a".repeat(40) }, registries),
    /source-commit claim/
  );
  assert.throws(
    () =>
      validateDeclaration(
        { ...declaration(), testRuns: [{ sourceCommit: "a".repeat(40) }] },
        registries
      ),
    /source-commit claim/
  );
  assert.throws(
    () =>
      validateDeclaration(
        { ...declaration(), activeGateRows: declaration().activeGateRows.slice(1) },
        registries
      ),
    /activeGateRows drift/
  );
});

test("rejects stale environment criterion evidence", () => {
  const document = declaration("M32");
  document.environmentGates[0].sourceBulletDigest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => validateDeclaration(document, registries), /Stale source bullet digest/);
});

test("binds post-commit manifests to the exact declaration", () => {
  const source = declaration();
  const unsigned = {
    schemaVersion: 1,
    milestone: "M01",
    declarationDigest: declarationDigest(source),
    sourceCommit: "a".repeat(40),
    workflowId: "workflow-1",
    jobId: "job-1",
    startedAt: "2026-07-31T10:00:00Z",
    endedAt: "2026-07-31T10:01:00Z",
    artifactDigests: { registries: sha256("registries") },
    imageDigests: { api: sha256("api-image") },
    sbomDigests: { cyclonedx: sha256("sbom") },
    provenanceDigests: { lockfile: sha256("lockfile") },
    testResults: [
      {
        id: "contracts",
        status: "PASS",
        evidenceUri: "artifact://M01/tests/contracts",
        artifactDigest: sha256("registries")
      }
    ],
    deployments: [],
    reviewerAttestations: [
      {
        id: "review-1",
        reviewer: "reviewer",
        evidenceUri: "artifact://M01/manual/review-1",
        artifactDigest: sha256("review")
      }
    ],
    evidenceUris: ["artifact://M01/contracts"]
  };
  const subjectDigest = sha256(canonicalJson(unsigned)).slice("sha256:".length);
  const bundleBytes = Buffer.from(
    canonicalJson({
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: { certificate: { rawBytes: "ZmFrZQ==" } },
      dsseEnvelope: {
        payloadType: "application/vnd.in-toto+json",
        payload: Buffer.from(
          canonicalJson({
            _type: "https://in-toto.io/Statement/v1",
            subject: [{ name: "unsigned-manifest.json", digest: { sha256: subjectDigest } }],
            predicateType: "https://slsa.dev/provenance/v1",
            predicate: {}
          })
        ).toString("base64"),
        signatures: [{ keyid: "", sig: "ZmFrZQ==" }]
      }
    }),
    "utf8"
  );
  const manifest = {
    ...unsigned,
    signature: {
      algorithm: "sigstore",
      identity: "ci://knotline/quality",
      bundleUri: "artifact://M01/signature",
      bundleDigest: sha256(bundleBytes.toString("utf8"))
    }
  };
  validateManifest(manifest, source);
  validateSigstoreBundleBinding(manifest, bundleBytes);
  assert.throws(
    () => validateManifest(manifest, { ...source, owners: ["changed"] }),
    /Stale declaration digest/
  );
  assert.throws(
    () =>
      validateManifest({ ...manifest, sourceCommit: declarationDigest(source).slice(7) }, source),
    /cannot use its declaration digest/
  );
  assert.throws(
    () => validateManifest({ ...manifest, signature: {} }, source),
    /manifest\.signature\.algorithm is required/
  );
  assert.throws(
    () => validateManifest({ ...manifest, sbomDigests: {} }, source),
    /sbomDigests must not be empty/
  );
  assert.throws(
    () => validateManifest({ ...manifest, reviewerAttestations: [] }, source),
    /reviewerAttestations must not be empty/
  );
  assert.throws(
    () => validateSigstoreBundleBinding({ ...manifest, jobId: "tampered-job" }, bundleBytes),
    /not bound to the canonical unsigned manifest/
  );
  const forgedBytes = Buffer.from(
    canonicalJson({ metadata: { claimedSubjectDigest: subjectDigest } }),
    "utf8"
  );
  const forgedManifest = {
    ...manifest,
    signature: {
      ...manifest.signature,
      bundleDigest: sha256(forgedBytes.toString("utf8"))
    }
  };
  assert.throws(
    () => validateSigstoreBundleBinding(forgedManifest, forgedBytes),
    /no standard DSSE envelope/
  );
});

function routeCoverageDocument() {
  const milestone = "M01";
  const make = (label, applicability, activationMilestone) => ({
    stateId: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    applicability,
    reason:
      applicability === "REQUIRED"
        ? "Required by the canonical matrix."
        : "Not present in the static page contract.",
    reviewer: "shurevan",
    ...(activationMilestone ? { activationMilestone } : {}),
    evidence:
      applicability === "REQUIRED"
        ? {
            fixture: "fixture:public-home",
            browserTest: "browser:public-home",
            accessibilityResult: "axe:public-home",
            localeSet: "en",
            viewportDevice: "desktop",
            authorizationPersona: "visitor",
            expectedTelemetry: "page-view",
            evidenceUri: "artifact://M02/routes/public-home"
          }
        : {}
  });
  return {
    schemaVersion: 1,
    milestone,
    planDigest: registries.index.planDigest,
    routeRegistryDigest: registries.index.entries.find(({ name }) => name === "routes").digest,
    routes: registries.routes.entries.map((route) => {
      const matrix = registries.routeStates.entries.find(
        ({ routeClass }) => routeClass === route.routeClass
      );
      return {
        routeId: route.id,
        states: [
          ...matrix.alwaysRequired,
          ...matrix.conditional,
          ...matrix.normallyNotApplicable
        ].map((label) => make(label, "NOT_YET_APPLICABLE", route.ownerMilestone))
      };
    })
  };
}

test("rejects unclassified route-state cells and unjustified N/A", () => {
  const valid = routeCoverageDocument();
  validateRouteCoverage(valid, registries);
  const missing = structuredClone(valid);
  missing.routes[0].states.pop();
  assert.throws(() => validateRouteCoverage(missing, registries), /Unclassified route-state cell/);
  const unjustified = structuredClone(valid);
  const cell = unjustified.routes[0].states[0];
  cell.reason = "";
  assert.throws(
    () => validateRouteCoverage(unjustified, registries),
    /reason must be a non-empty string/
  );
});

function traceabilityDocument() {
  return {
    schemaVersion: 1,
    planDigest: registries.index.planDigest,
    traceabilityRegistryDigest: registries.index.entries.find(({ name }) => name === "traceability")
      .digest,
    requirements: registries.traceability.entries.map((expected) => ({
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
      sourceSymbols: [],
      automatedTests: [],
      manualEvidence: [],
      operationalControls: [],
      externalGates: expected.externalGates,
      engineeringState: "NOT_STARTED",
      environmentState: "NOT_DEPLOYED",
      ...(expected.supportContractReason
        ? { supportContractReason: expected.supportContractReason }
        : {})
    }))
  };
}

test("rejects incomplete traceability and committed rows without evidence", () => {
  const valid = traceabilityDocument();
  validateTraceability(valid, registries);
  assert.throws(
    () => validateTraceability({ ...valid, requirements: valid.requirements.slice(1) }, registries),
    /Traceability is incomplete/
  );
  const unevidenced = structuredClone(valid);
  unevidenced.requirements.find(
    ({ requirementId }) => requirementId === "OP-001"
  ).engineeringState = "COMMITTED";
  assert.throws(() => validateTraceability(unevidenced, registries), /lacks UT evidence/);
});

function externalLedger() {
  return {
    schemaVersion: 1,
    planDigest: registries.index.planDigest,
    gates: registries.externalGates.entries.map((item) => ({
      gateId: item.id,
      state: "BLOCKED_EXTERNAL",
      requiredTerminalState: item.requiredTerminalState,
      accountableOwner: "shurevan",
      gaRequired: item.gaPolicy === "REQUIRED",
      reviewExpiresAt: null,
      evidenceUris: []
    }))
  };
}

test("requires every external gate and prevents unsupported LIVE claims", () => {
  const ledger = externalLedger();
  validateExternalGateLedger(ledger, registries);
  assert.throws(
    () => validateExternalGateLedger({ ...ledger, gates: ledger.gates.slice(1) }, registries),
    /incomplete/
  );
  assert.throws(
    () =>
      validateCapabilities(
        [
          {
            id: "workflow.runtime",
            status: "LIVE",
            summary: "Durable workflow execution.",
            owner: { team: "runtime", contact: "shurevan" },
            runbook: "docs/operations/knotline/production-controls.md",
            externalGates: ["EXT-003"],
            evidence: {
              environment: "production",
              verifiedAt: "2026-07-31T10:00:00Z",
              reference: "artifact://capability/runtime"
            }
          }
        ],
        ledger
      ),
    /unverified gate EXT-003/
  );
});

test("repository evidence check cannot pass with only a declaration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knotline-evidence-"));
  await mkdir(join(directory, "M01"), { recursive: true });
  await writeFile(join(directory, "M01/declaration.json"), canonicalJson(declaration()));
  await assert.rejects(checkEvidence(directory), /missing route-coverage\.json/);
});

test("post-commit mode requires one signed manifest per declaration", async () => {
  await assert.rejects(
    checkEvidence(join(ROOT, "artifacts/verification"), { postcommit: true }),
    /Post-commit evidence requires one manifest\.json per declaration\.json/
  );
});
