import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { canonicalJson } from "../../tooling/quality/plan-contract.mjs";

const required = ["GITHUB_REPOSITORY", "GITHUB_REF", "ATTESTATION_BUNDLE_PATH", "ATTESTATION_URL"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

function digest(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

const unsignedBytes = readFileSync("artifacts/attestation/unsigned-manifest.json");
const unsignedManifest = JSON.parse(unsignedBytes.toString("utf8"));
if (!unsignedBytes.equals(Buffer.from(canonicalJson(unsignedManifest), "utf8"))) {
  throw new Error("Attestation subject must use canonical JSON encoding");
}

const bundleBytes = readFileSync(process.env.ATTESTATION_BUNDLE_PATH);
if (bundleBytes.length === 0) throw new Error("Attestation bundle must not be empty");

const manifest = {
  ...unsignedManifest,
  signature: {
    algorithm: "sigstore",
    identity: `https://github.com/${process.env.GITHUB_REPOSITORY}/.github/workflows/ci.yml@${process.env.GITHUB_REF}`,
    bundleUri: process.env.ATTESTATION_URL,
    bundleDigest: digest(bundleBytes)
  }
};

mkdirSync("artifacts/verification/M01", { recursive: true });
copyFileSync(
  process.env.ATTESTATION_BUNDLE_PATH,
  "artifacts/verification/M01/sigstore-bundle.json"
);
writeFileSync("artifacts/verification/M01/manifest.json", canonicalJson(manifest), "utf8");
