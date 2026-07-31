#!/usr/bin/env node

import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { canonicalJson } from "../quality/plan-contract.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const DIST = join(ROOT, "apps", "web", "dist");
const REPORT = join(ROOT, "artifacts", "performance", "M02", "bundle-budget.json");
const MAX_JS_BYTES = 350_000;
const MAX_TOTAL_GZIP_BYTES = 180_000;

export function evaluateAssets(assets) {
  const errors = [];
  let totalGzipBytes = 0;
  for (const asset of assets) {
    totalGzipBytes += asset.gzipBytes;
    if (asset.name.endsWith(".js") && asset.bytes > MAX_JS_BYTES)
      errors.push(`${asset.name} exceeds ${MAX_JS_BYTES} raw bytes`);
    if (asset.name.endsWith(".js") && /(?:^|[^a-z])eval\s*\(/u.test(asset.source))
      errors.push(`${asset.name} contains routine eval usage`);
  }
  if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES)
    errors.push(`Total compressed assets exceed ${MAX_TOTAL_GZIP_BYTES} bytes`);
  return { errors, totalGzipBytes };
}

if (process.argv.includes("--self-test")) {
  const result = evaluateAssets([
    { name: "large.js", bytes: MAX_JS_BYTES + 1, gzipBytes: 10, source: "eval('x')" }
  ]);
  if (result.errors.length !== 2) throw new Error("Bundle budget self-test failed");
  process.stdout.write("Bundle budget self-test passed.\n");
} else {
  const directory = join(DIST, "assets");
  const assets = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!/\.(?:css|js)$/u.test(name)) continue;
    const source = await readFile(join(directory, name));
    assets.push({
      name: basename(name),
      bytes: source.byteLength,
      gzipBytes: gzipSync(source, { level: 9 }).byteLength,
      source: source.toString("utf8")
    });
  }
  const result = evaluateAssets(assets);
  const report = {
    schemaVersion: 1,
    status: result.errors.length === 0 ? "PASS" : "FAIL",
    limits: { maxJavaScriptBytes: MAX_JS_BYTES, maxTotalGzipBytes: MAX_TOTAL_GZIP_BYTES },
    totalGzipBytes: result.totalGzipBytes,
    assets: assets.map(({ name, bytes, gzipBytes }) => ({ name, bytes, gzipBytes })),
    errors: result.errors
  };
  await mkdir(resolve(REPORT, ".."), { recursive: true });
  await writeFile(REPORT, canonicalJson(report), "utf8");
  if (result.errors.length > 0) throw new Error(result.errors.join("\n"));
  process.stdout.write(`Bundle and CSP budget passed (${result.totalGzipBytes} gzip bytes).\n`);
}
