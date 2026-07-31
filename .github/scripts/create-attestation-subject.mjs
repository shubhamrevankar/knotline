import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { declarationDigest } from "../../tooling/gate/evidence.mjs";
import { canonicalJson } from "../../tooling/quality/plan-contract.mjs";

const required = [
  "GITHUB_SHA",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_ATTEMPT",
  "GITHUB_WORKFLOW_REF",
  "GITHUB_REPOSITORY",
  "GITHUB_SERVER_URL"
];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const requiredLanes = new Set([
  "static",
  "unit",
  "integration",
  "browser",
  "visual",
  "build",
  "containers",
  "scans"
]);
const downloadedRoot = "artifacts/downloaded";
const recordedAt = new Date().toISOString();
const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const declaration = JSON.parse(readFileSync("artifacts/verification/M01/declaration.json", "utf8"));

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function filesBelow(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...filesBelow(path));
    else files.push(path);
  }
  return files;
}

const files = filesBelow(downloadedRoot);
if (files.length === 0) throw new Error("No downloaded lane artifacts were found");
const artifactDigests = Object.fromEntries(
  files.map((path) => [relative(downloadedRoot, path), digest(readFileSync(path))])
);

const laneResults = [];
for (const path of files.filter((path) => path.endsWith("/result.json"))) {
  const result = JSON.parse(readFileSync(path, "utf8"));
  if (!requiredLanes.has(result.lane) || result.status !== "PASS") continue;
  if (result.sourceCommit !== process.env.GITHUB_SHA)
    throw new Error(`Lane ${result.lane} is bound to the wrong source commit`);
  laneResults.push({ result, path });
}
const seenLanes = new Set(laneResults.map(({ result }) => result.lane));
for (const lane of requiredLanes)
  if (!seenLanes.has(lane)) throw new Error(`Missing ${lane} lane evidence`);
if (seenLanes.size !== laneResults.length)
  throw new Error("Duplicate lane evidence was downloaded");

const imageReportPath = files.find((path) => path.endsWith("/containers/images.json"));
if (!imageReportPath) throw new Error("Container image inspection evidence is missing");
const images = JSON.parse(readFileSync(imageReportPath, "utf8"));
const imageDigests = Object.fromEntries(
  images.map((image, index) => [image.RepoTags?.[0] ?? `image-${index + 1}`, image.Id])
);

const sbomPath = files.find((path) => path.endsWith("/knotline.cdx.json"));
if (!sbomPath) throw new Error("CycloneDX SBOM evidence is missing");
const lockfilePath = files.find((path) => path.endsWith("/pnpm-lock.yaml"));
const registryPath = files.find((path) => path.endsWith("/registry-index.json"));
if (!lockfilePath || !registryPath) throw new Error("Build provenance inputs are missing");

const reviewerPath = "artifacts/verification/M01/manual/product-continuity.json";
const reviewer = JSON.parse(readFileSync(reviewerPath, "utf8"));
if (reviewer.status !== "PASS") throw new Error("Product continuity review did not pass");

const unsignedManifest = {
  schemaVersion: 1,
  milestone: "M01",
  declarationDigest: declarationDigest(declaration),
  sourceCommit: process.env.GITHUB_SHA,
  workflowId: process.env.GITHUB_WORKFLOW_REF,
  jobId: `evidence-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
  startedAt: recordedAt,
  endedAt: recordedAt,
  artifactDigests,
  imageDigests,
  sbomDigests: { "knotline.cdx.json": digest(readFileSync(sbomPath)) },
  provenanceDigests: {
    "pnpm-lock.yaml": digest(readFileSync(lockfilePath)),
    "registry-index.json": digest(readFileSync(registryPath))
  },
  testResults: laneResults
    .sort((left, right) => left.result.lane.localeCompare(right.result.lane, "en"))
    .map(({ result, path }) => ({
      id: result.lane,
      status: "PASS",
      evidenceUri: `${runUrl}#artifacts/${relative(downloadedRoot, path)}`,
      artifactDigest: digest(readFileSync(path))
    })),
  deployments: [],
  reviewerAttestations: [
    {
      id: reviewer.id,
      reviewer: reviewer.owner,
      evidenceUri: "artifact://M01/manual/product-continuity",
      artifactDigest: digest(readFileSync(reviewerPath))
    }
  ],
  evidenceUris: [runUrl]
};

mkdirSync("artifacts/attestation", { recursive: true });
writeFileSync(
  "artifacts/attestation/unsigned-manifest.json",
  canonicalJson(unsignedManifest),
  "utf8"
);
