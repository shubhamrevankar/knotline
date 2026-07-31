import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const reportDirectory = resolve(process.env.SCAN_REPORT_DIR ?? `${root}/artifacts/scans`);
const baselinePath = resolve(root, "tooling/scans/advisory-baseline.json");
const lockfilePath = resolve(root, "pnpm-lock.yaml");

export function compareVersions(left, right) {
  const normalize = (value) =>
    value
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = normalize(left);
  const rightParts = normalize(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function resolvedVersions(lockfile, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const expression = new RegExp(`^  ['"]?${escaped}@([^:'"(]+)`, "gmu");
  return [...lockfile.matchAll(expression)].map((match) => match[1]).filter(Boolean);
}

async function scan() {
  const [baseline, lockfile] = await Promise.all([
    readFile(baselinePath, "utf8").then(JSON.parse),
    readFile(lockfilePath, "utf8")
  ]);
  const findings = [];
  const checks = [];
  for (const policy of baseline.policies) {
    const versions = [...new Set(resolvedVersions(lockfile, policy.package))].sort(compareVersions);
    if (versions.length === 0) {
      findings.push({ package: policy.package, reason: "package-missing-from-lockfile" });
      continue;
    }
    for (const version of versions) {
      const passes = compareVersions(version, policy.minimumSafeVersion) >= 0;
      checks.push({
        package: policy.package,
        version,
        minimumSafeVersion: policy.minimumSafeVersion,
        passes
      });
      if (!passes)
        findings.push({
          package: policy.package,
          version,
          minimumSafeVersion: policy.minimumSafeVersion,
          advisoryIds: policy.advisoryIds,
          severity: policy.severity
        });
    }
  }
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    resolve(reportDirectory, "dependencies.json"),
    `${JSON.stringify(
      {
        scanner: "knotline-offline-advisory-policy",
        networkAccess: false,
        baselineAsOf: baseline.asOf,
        limitation: baseline.limitation,
        checks,
        blockingFindings: findings
      },
      null,
      2
    )}\n`
  );
  if (findings.length > 0) {
    for (const finding of findings)
      console.error(
        `${finding.package}@${finding.version ?? "missing"}: ${finding.reason ?? "unsafe"}`
      );
    process.exitCode = 1;
    return;
  }
  console.log(`Offline dependency policy passed (${checks.length} resolved-version checks).`);
}

function selfTest() {
  if (compareVersions("5.5.6", "5.5.6") !== 0 || compareVersions("5.5.5", "5.5.6") >= 0)
    throw new Error("Dependency scanner version comparison failed.");
  const fixture = "packages:\n  fast-xml-parser@5.5.6:\n    resolution: {}\n";
  if (resolvedVersions(fixture, "fast-xml-parser")[0] !== "5.5.6")
    throw new Error("Dependency scanner lockfile resolution failed.");
  console.log("Dependency scanner self-test passed.");
}

if (process.argv.includes("--self-test")) selfTest();
else await scan();
