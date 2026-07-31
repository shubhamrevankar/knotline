#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, sha256 } from "../quality/plan-contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCKFILE = join(ROOT, "pnpm-lock.yaml");
const OUTPUT = join(ROOT, "artifacts", "scans", "knotline.cdx.json");

function packageIdentity(locator) {
  const separator = locator.lastIndexOf("@");
  if (separator <= 0 || separator === locator.length - 1) return undefined;
  return { name: locator.slice(0, separator), version: locator.slice(separator + 1) };
}

export function lockfileComponents(source) {
  const components = new Map();
  let inPackages = false;
  let current;
  for (const line of source.split(/\r?\n/u)) {
    if (line === "packages:") {
      inPackages = true;
      current = undefined;
      continue;
    }
    if (inPackages && /^(?:snapshots|importers|settings|catalogs):$/u.test(line)) {
      inPackages = false;
      current = undefined;
      continue;
    }
    if (!inPackages) continue;
    const packageMatch = /^ {2}(?:'([^']+)'|([^'\s][^:]*)):\s*$/u.exec(line);
    if (packageMatch) {
      const locator = packageMatch[1] ?? packageMatch[2];
      const identity = packageIdentity(locator);
      current = identity ? { ...identity } : undefined;
      if (current) components.set(`${current.name}@${current.version}`, current);
      continue;
    }
    const integrityMatch = /^ {4}resolution: \{integrity: (sha(?:256|384|512))-([^}]+)\}/u.exec(
      line
    );
    if (current && integrityMatch) {
      current.hashes = [
        {
          alg: integrityMatch[1].toUpperCase().replace("SHA", "SHA-"),
          content: Buffer.from(integrityMatch[2], "base64").toString("hex")
        }
      ];
    }
  }
  return [...components.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`, "en")
  );
}

function purl(name, version) {
  if (name.startsWith("@")) {
    const [scope, packageName] = name.split("/");
    return `pkg:npm/${encodeURIComponent(scope)}/${packageName}@${version}`;
  }
  return `pkg:npm/${name}@${version}`;
}

export function buildSbom(source) {
  const lockDigest = sha256(source);
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      component: {
        type: "application",
        "bom-ref": "pkg:npm/knotline@0.1.0",
        name: "knotline",
        version: "0.1.0",
        purl: "pkg:npm/knotline@0.1.0"
      },
      properties: [{ name: "knotline:pnpm-lockfile-digest", value: lockDigest }]
    },
    components: lockfileComponents(source).map((component) => ({
      type: "library",
      "bom-ref": purl(component.name, component.version),
      name: component.name,
      version: component.version,
      purl: purl(component.name, component.version),
      ...(component.hashes ? { hashes: component.hashes } : {})
    }))
  };
}

function selfTest() {
  const fixture = `packages:\n\n  '@scope/example@1.2.3':\n    resolution: {integrity: sha512-YWJj}\n\n  plain@2.0.0:\n    resolution: {integrity: sha256-ZGVm}\n\nsnapshots:\n`;
  const components = lockfileComponents(fixture);
  if (
    components.length !== 2 ||
    components[0]?.name !== "@scope/example" ||
    components[0]?.hashes?.[0]?.alg !== "SHA-512"
  ) {
    throw new Error("SBOM lockfile extraction self-test failed");
  }
}

async function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    process.stdout.write("SBOM generator self-test passed.\n");
    return;
  }
  const source = await readFile(LOCKFILE, "utf8");
  const sbom = buildSbom(source);
  if (sbom.components.length < 1) throw new Error("SBOM contains no dependency components");
  const bytes = canonicalJson(sbom);
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, bytes, "utf8");
  process.stdout.write(
    `Generated ${relative(ROOT, OUTPUT)} with ${sbom.components.length} components (${sha256(bytes)}).\n`
  );
}

await main();
