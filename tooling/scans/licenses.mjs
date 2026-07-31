import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);
const deniedLicense = /(?:^|\W)(?:AGPL|GPL|SSPL|BUSL)(?:-|\W|$)|Commons Clause/iu;

export function findDeniedLicenses(report) {
  const denied = [];
  for (const [license, packages] of Object.entries(report)) {
    if (!deniedLicense.test(license)) continue;
    denied.push({ license, packages });
  }
  return denied;
}

async function packageManifestPaths() {
  const store = join(repositoryRoot, "node_modules", ".pnpm");
  const paths = [];
  for (const locator of await readdir(store, { withFileTypes: true })) {
    if (!locator.isDirectory()) continue;
    const modules = join(store, locator.name, "node_modules");
    for (const entry of await readdir(modules, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("@")) {
        const scope = join(modules, entry.name);
        for (const child of await readdir(scope, { withFileTypes: true })) {
          if (child.isDirectory()) paths.push(join(scope, child.name, "package.json"));
        }
      } else {
        paths.push(join(modules, entry.name, "package.json"));
      }
    }
  }
  return paths;
}

export async function installedLicenseReport() {
  const packages = new Map();
  for (const path of await packageManifestPaths()) {
    const manifest = JSON.parse(await readFile(path, "utf8").catch(() => "null"));
    if (!manifest || typeof manifest.name !== "string" || typeof manifest.version !== "string")
      continue;
    const license =
      typeof manifest.license === "string"
        ? manifest.license
        : typeof manifest.license?.type === "string"
          ? manifest.license.type
          : "UNKNOWN";
    packages.set(`${manifest.name}@${manifest.version}`, {
      name: manifest.name,
      version: manifest.version,
      license
    });
  }
  const report = {};
  for (const item of [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`, "en")
  )) {
    (report[item.license] ??= []).push({ name: item.name, version: item.version });
  }
  return report;
}

if (process.argv.includes("--self-test")) {
  const denied = findDeniedLicenses({
    MIT: [{ name: "safe" }],
    "AGPL-3.0-only": [{ name: "unsafe" }]
  });
  if (denied.length !== 1 || denied[0]?.license !== "AGPL-3.0-only") {
    throw new Error("license policy self-test failed");
  }
  console.log("License scanner self-test passed.");
} else {
  const report = await installedLicenseReport();
  if (Object.values(report).flat().length === 0) throw new Error("No installed licenses found");
  const denied = findDeniedLicenses(report);
  const reportDirectory = resolve(
    process.env.SCAN_REPORT_DIR ?? join(repositoryRoot, "artifacts/scans")
  );
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    join(reportDirectory, "licenses.json"),
    `${JSON.stringify({ denied, report }, null, 2)}\n`
  );
  if (denied.length > 0) {
    for (const finding of denied) console.error(`Denied license: ${finding.license}`);
    process.exitCode = 1;
  } else {
    console.log(`License scan passed (${Object.values(report).flat().length} packages).`);
  }
}
