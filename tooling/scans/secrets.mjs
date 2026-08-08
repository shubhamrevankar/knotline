import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);
const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);
const rules = [
  {
    id: "pem-private-key",
    expression: new RegExp(["-----BEGIN ", "PRIVATE KEY-----"].join(""), "gu")
  },
  { id: "cloud-access-key", expression: new RegExp(["AK", "IA", "[A-Z0-9]{16}"].join(""), "gu") },
  {
    id: "source-host-token",
    expression: new RegExp(["gh", "p_", "[A-Za-z0-9]{36,}"].join(""), "gu")
  },
  {
    id: "assigned-secret",
    expression:
      /(?:api[_-]?key|password|secret|token)[ \t]*[:=][ \t]*(?:"([^"\r\n]{12,256})"|'([^'\r\n]{12,256})'|([a-z0-9][a-z0-9_./+=:@-]{11,255})[ \t]*(?=$|#))/gimu
  }
];

function authoredFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repositoryRoot
    }
  );
  return output.toString("utf8").split("\0").filter(Boolean);
}

function isAllowedLocalOnly(match) {
  const normalized = match.toLowerCase();
  return /[:=]\s*["']?(?:local-only(?::|-)|change-me(?::|-|$))/u.test(normalized);
}

export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    let content;
    try {
      content = readFileSync(resolve(repositoryRoot, file), "utf8");
    } catch {
      continue;
    }
    for (const rule of rules) {
      rule.expression.lastIndex = 0;
      for (const match of content.matchAll(rule.expression)) {
        if (isAllowedLocalOnly(match[0])) continue;
        const line = content.slice(0, match.index).split("\n").length;
        findings.push({ ruleId: rule.id, file, line });
      }
    }
  }
  return findings;
}

function selfTest() {
  const directory = mkdtempSync(join(tmpdir(), "knotline-secret-scan-"));
  const relativeDirectory = relative(repositoryRoot, directory);
  try {
    const unsafe = join(directory, "unsafe.env");
    const safe = join(directory, "safe.txt");
    writeFileSync(
      unsafe,
      [
        ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
        ["AK", "IA", "ABCDEFGHIJKLMNOP"].join(""),
        ["gh", "p_", "abcdefghijklmnopqrstuvwxyz0123456789"].join(""),
        ["to", 'ken="quoted-sensitive-value-123"'].join(""),
        ["API", "_KEY=dotenv-sensitive-value-123"].join(""),
        ["pass", "word: yaml-sensitive-value-123"].join(""),
        ["API", "_SECRET=live-sensitive-value-local-only"].join("")
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      safe,
      [
        'password="local-only-not-a-secret"',
        "API_KEY=",
        "CLIENT_SECRET=",
        "const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;",
        "const token = inheritedToken();",
        "ClientRequestToken = base64url(SHA-256(recordIdentity))"
      ].join("\n"),
      "utf8"
    );
    const findings = scanFiles([
      join(relativeDirectory, "unsafe.env"),
      join(relativeDirectory, "safe.txt")
    ]);
    const ruleCounts = Object.fromEntries(
      rules.map(({ id }) => [id, findings.filter(({ ruleId }) => ruleId === id).length])
    );
    if (
      ruleCounts["pem-private-key"] !== 1 ||
      ruleCounts["cloud-access-key"] !== 1 ||
      ruleCounts["source-host-token"] !== 1 ||
      ruleCounts["assigned-secret"] !== 4 ||
      findings.length !== 7
    ) {
      throw new Error(`secret scanner self-test failed: ${JSON.stringify(findings)}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
  console.log("Secret scanner self-test passed.");
} else {
  const findings = scanFiles(authoredFiles());
  const reportDirectory = resolve(
    process.env.SCAN_REPORT_DIR ?? join(repositoryRoot, "artifacts/scans")
  );
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(
    join(reportDirectory, "secrets.json"),
    `${JSON.stringify({ scanner: "knotline-secret-policy", findings }, null, 2)}\n`,
    "utf8"
  );
  if (findings.length > 0) {
    for (const finding of findings)
      console.error(`${finding.file}:${finding.line} ${finding.ruleId}`);
    process.exitCode = 1;
  } else {
    console.log("Secret scan passed.");
  }
}
