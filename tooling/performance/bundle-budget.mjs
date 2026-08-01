#!/usr/bin/env node

import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { canonicalJson } from "../quality/plan-contract.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const DIST = join(ROOT, "apps", "web", "dist");
const REPORT = join(ROOT, "artifacts", "performance", "M02", "bundle-budget.json");
const MAX_JS_BYTES = 350_000;
// M26 adds the localized trigger operator route while keeping its implementation
// in a lazy chunk. The reviewed measurement is 159,659 initial / 275,028 total
// gzip. These ceilings retain roughly 1.3 KB of initial and 6 KB of total
// headroom; the unchanged 350 KB per-JavaScript-chunk cap still prevents a large
// route from hiding behind aggregate compression.
const MAX_INITIAL_GZIP_BYTES = 161_000;
const MAX_TOTAL_GZIP_BYTES = 281_000;

export function evaluateAssets(assets, initialAssetNames = new Set()) {
  const errors = [];
  let totalGzipBytes = 0;
  let initialGzipBytes = 0;
  for (const asset of assets) {
    totalGzipBytes += asset.gzipBytes;
    if (initialAssetNames.has(asset.name)) initialGzipBytes += asset.gzipBytes;
    if (asset.name.endsWith(".js") && asset.bytes > MAX_JS_BYTES)
      errors.push(`${asset.name} exceeds ${MAX_JS_BYTES} raw bytes`);
    if (asset.name.endsWith(".js") && /(?:^|[^a-z])eval\s*\(/u.test(asset.source))
      errors.push(`${asset.name} contains routine eval usage`);
  }
  if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES)
    errors.push(`Total compressed assets exceed ${MAX_TOTAL_GZIP_BYTES} bytes`);
  if (initialGzipBytes > MAX_INITIAL_GZIP_BYTES)
    errors.push(`Initial compressed assets exceed ${MAX_INITIAL_GZIP_BYTES} bytes`);
  return { errors, initialGzipBytes, totalGzipBytes };
}

function initialAssets(manifest) {
  const names = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || names.has(basename(chunk.file))) return;
    names.add(basename(chunk.file));
    for (const css of chunk.css ?? []) names.add(basename(css));
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key);
  return names;
}

if (process.argv.includes("--self-test")) {
  const result = evaluateAssets([
    { name: "large.js", bytes: MAX_JS_BYTES + 1, gzipBytes: 10, source: "eval('x')" }
  ]);
  if (result.errors.length !== 2) throw new Error("Bundle budget self-test failed");
  const initial = evaluateAssets(
    [{ name: "entry.js", bytes: 10, gzipBytes: MAX_INITIAL_GZIP_BYTES + 1, source: "" }],
    new Set(["entry.js"])
  );
  if (!initial.errors.some((error) => error.startsWith("Initial compressed")))
    throw new Error("Initial bundle budget self-test failed");
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
  const manifest = JSON.parse(await readFile(join(DIST, ".vite", "manifest.json"), "utf8"));
  const initialAssetNames = initialAssets(manifest);
  const result = evaluateAssets(assets, initialAssetNames);
  const report = {
    schemaVersion: 1,
    status: result.errors.length === 0 ? "PASS" : "FAIL",
    limits: {
      maxJavaScriptBytes: MAX_JS_BYTES,
      maxInitialGzipBytes: MAX_INITIAL_GZIP_BYTES,
      maxTotalGzipBytes: MAX_TOTAL_GZIP_BYTES
    },
    initialGzipBytes: result.initialGzipBytes,
    initialAssets: [...initialAssetNames].sort(),
    totalGzipBytes: result.totalGzipBytes,
    assets: assets.map(({ name, bytes, gzipBytes }) => ({ name, bytes, gzipBytes })),
    errors: result.errors
  };
  await mkdir(resolve(REPORT, ".."), { recursive: true });
  await writeFile(REPORT, canonicalJson(report), "utf8");
  if (result.errors.length > 0) throw new Error(result.errors.join("\n"));
  process.stdout.write(
    `Bundle and CSP budget passed (${result.initialGzipBytes} initial / ${result.totalGzipBytes} total gzip bytes).\n`
  );
}
