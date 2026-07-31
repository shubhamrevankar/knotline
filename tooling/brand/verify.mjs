#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".map",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".scss",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);
const GENERATED_DIRECTORIES = ["dist"];
const EXCLUDED_SEGMENTS = new Set([".git", "coverage", "node_modules"]);

function inheritedToken() {
  return String.fromCharCode(116, 114, 97, 99, 101);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const PROHIBITED_ASSET_HASHES = new Set([sha256(Buffer.from("inherited-source-asset-v1", "utf8"))]);
const PROHIBITED_COPY_HASHES = new Set([
  sha256(`Build operational software with ${inheritedToken()}.`)
]);

function textFindings(text) {
  const token = inheritedToken();
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const rules = [
    ["PROVENANCE-DOMAIN", new RegExp(`${escaped}\\.so`, "iu")],
    ["PROVENANCE-BRAND", new RegExp(`\\b${token[0]?.toUpperCase()}${escaped.slice(1)}\\b`, "u")],
    [
      "PROVENANCE-IDENTIFIER",
      new RegExp(`(?:@${escaped}[-_/]|\\b${escaped}-(?:app|product|sdk|so)\\b)`, "iu")
    ],
    [
      "PROVENANCE-MARKER",
      new RegExp(`(?:copied|derived|ported|cloned)\\s+(?:from|after)\\s+${escaped}`, "iu")
    ]
  ];
  const findings = [];
  for (const [ruleId, pattern] of rules) {
    if (pattern.test(text)) findings.push(ruleId);
  }
  for (const line of text.split(/\r?\n/u)) {
    if (PROHIBITED_COPY_HASHES.has(sha256(line.trim()))) {
      findings.push("PROVENANCE-COPY-FINGERPRINT");
    }
  }
  return [...new Set(findings)];
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function authoredFiles(root) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root }
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => resolve(root, path));
}

async function candidateFiles(root) {
  const files = authoredFiles(root);
  for (const generatedDirectory of GENERATED_DIRECTORIES) {
    for (const top of ["apps", "packages"]) {
      const parent = resolve(root, top);
      try {
        for (const workspace of await readdir(parent)) {
          const directory = resolve(parent, workspace, generatedDirectory);
          try {
            files.push(...(await walk(directory)));
          } catch {
            // Generated output is optional before the build row.
          }
        }
      } catch {
        // Workspace family does not exist yet.
      }
    }
  }
  return [...new Set(files)].filter((path) => {
    const repositoryPath = relative(root, path).replaceAll("\\", "/");
    return repositoryPath !== "docs" && !repositoryPath.startsWith("docs/");
  });
}

export async function verifyProvenance(root) {
  const findings = [];
  for (const path of await candidateFiles(root)) {
    const bytes = await readFile(path);
    const repositoryPath = relative(root, path).replaceAll("\\", "/");
    if (PROHIBITED_ASSET_HASHES.has(sha256(bytes))) {
      findings.push({ file: repositoryPath, ruleId: "PROVENANCE-ASSET-HASH" });
      continue;
    }
    if (["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].includes(repositoryPath)) {
      continue;
    }
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase()) || bytes.includes(0)) continue;
    for (const ruleId of textFindings(bytes.toString("utf8"))) {
      findings.push({ file: repositoryPath, ruleId });
    }
  }
  return findings;
}

async function selfTest() {
  const root = await mkdtemp(join(tmpdir(), "knotline-provenance-"));
  try {
    await execFile("git", ["init", "-q"], root);
    const token = inheritedToken();
    await mkdir(join(root, "tests", "fixtures"), { recursive: true });
    const cases = [
      ["name.ts", `export const inherited = "${token[0]?.toUpperCase()}${token.slice(1)}";`],
      ["domain.txt", `https://www.${token}.so/`],
      ["identifier.ts", `const packageName = "@${token}/sdk";`],
      ["copy.txt", `Build operational software with ${token}.`],
      ["asset.bin", "inherited-source-asset-v1"],
      ["authored.md", `# ${token[0]?.toUpperCase()}${token.slice(1)} product`]
    ];
    for (const [name, contents] of cases) await writeFile(join(root, name), contents);
    await writeFile(
      join(root, "tests", "fixtures", "inherited.ts"),
      `export const fixtureBrand = "${token[0]?.toUpperCase()}${token.slice(1)}";`
    );
    await writeFile(join(root, "allowed.ts"), "const traceId = span.traceId;\n");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(
      join(root, "docs", "historical-reference.md"),
      `# ${token[0]?.toUpperCase()}${token.slice(1)}\n`
    );
    await writeFile(join(root, "pnpm-lock.yaml"), `  /@${token}/immutable-metadata: 1.0.0\n`);
    await mkdir(join(root, "apps", "web", "dist"), { recursive: true });
    await writeFile(
      join(root, "apps", "web", "dist", "generated.js"),
      `globalThis.productName="${token[0]?.toUpperCase()}${token.slice(1)}";`
    );
    await writeFile(
      join(root, "apps", "web", "dist", "generated.js.map"),
      JSON.stringify({ sourcesContent: [`const source = "https://${token}.so";`] })
    );
    const findings = await verifyProvenance(root);
    const rules = new Set(findings.map((finding) => finding.ruleId));
    for (const required of [
      "PROVENANCE-BRAND",
      "PROVENANCE-DOMAIN",
      "PROVENANCE-IDENTIFIER",
      "PROVENANCE-COPY-FINGERPRINT",
      "PROVENANCE-ASSET-HASH"
    ]) {
      if (!rules.has(required)) throw new Error(`Self-test did not exercise ${required}.`);
    }
    if (findings.some((finding) => finding.file === "allowed.ts")) {
      throw new Error("Standard distributed tracing terminology was rejected.");
    }
    if (
      findings.some(
        (finding) => finding.file.startsWith("docs/") || finding.file === "pnpm-lock.yaml"
      )
    ) {
      throw new Error("Reviewed documentation or immutable package metadata was rejected.");
    }
    if (!findings.some((finding) => finding.file.endsWith("dist/generated.js"))) {
      throw new Error("Generated runtime output was not scanned.");
    }
    if (!findings.some((finding) => finding.file.endsWith("dist/generated.js.map"))) {
      throw new Error("Generated source maps were not scanned.");
    }
    if (!findings.some((finding) => finding.file.startsWith("tests/fixtures/"))) {
      throw new Error("Authored test fixtures were not scanned.");
    }
    process.stdout.write(`provenance self-test passed (${String(findings.length)} findings)\n`);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function execFile(command, args, cwd) {
  const { execFile: execute } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    execute(command, args, { cwd }, (error) => (error ? reject(error) : resolve()));
  });
}

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);
if (process.argv.includes("--self-test")) {
  await selfTest();
} else {
  const findings = await verifyProvenance(repositoryRoot);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(`${finding.file}: ${finding.ruleId}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write("provenance verification passed\n");
  }
}
