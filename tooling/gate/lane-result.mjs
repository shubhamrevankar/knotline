#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../quality/plan-contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALID_LANES = new Set([
  "static",
  "unit",
  "integration",
  "browser",
  "visual",
  "build",
  "containers",
  "scans"
]);

async function filesBelow(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const files = [];
  for (const name of (await readdir(path)).sort())
    files.push(...(await filesBelow(join(path, name))));
  return files;
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const [lane, ...inputs] = process.argv.slice(2);
if (!VALID_LANES.has(lane)) throw new Error(`Unknown CI lane: ${String(lane)}`);
if (inputs.length === 0) throw new Error(`Lane ${lane} must name at least one evidence input`);

const artifactDigests = {};
for (const input of inputs) {
  const path = resolve(ROOT, input);
  if (relative(ROOT, path).startsWith(".."))
    throw new Error(`Evidence path escapes repository: ${input}`);
  for (const file of await filesBelow(path)) {
    const name = relative(ROOT, file);
    artifactDigests[name] = digest(await readFile(file));
  }
}
if (Object.keys(artifactDigests).length === 0) throw new Error(`Lane ${lane} evidence is empty`);

const result = {
  schemaVersion: 1,
  lane,
  status: "PASS",
  sourceCommit: process.env.GITHUB_SHA ?? "local-uncommitted",
  workflowRun: process.env.GITHUB_RUN_ID ?? "local",
  artifactDigests
};
const output = join(ROOT, "artifacts", "lane-evidence", lane, "result.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, canonicalJson(result), "utf8");
process.stdout.write(
  `Recorded ${lane} evidence with ${Object.keys(artifactDigests).length} digests.\n`
);
