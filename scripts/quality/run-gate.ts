import { spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type GateStatus = "ACTIVE" | "BLOCKED_EXTERNAL" | "NOT_YET_APPLICABLE";

export interface GateRow {
  readonly name: string;
  readonly status: GateStatus;
  readonly script?: string;
  readonly requiredTestFiles?: readonly string[];
  readonly activationMilestone?: string;
  readonly externalGateId?: string;
  readonly declarationRow?: string;
}

export interface GateManifest {
  readonly schemaVersion: 1;
  readonly milestone: string;
  readonly rows: readonly GateRow[];
}

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

interface GateActivationRegistry {
  readonly entries: readonly {
    readonly activationMilestones: readonly string[];
    readonly capability: string;
  }[];
}

interface EvidenceDeclaration {
  readonly milestone: string;
  readonly activeGateRows: readonly string[];
}

const ACTIVATION_MILESTONES = {
  build: "M01",
  "format:check": "M01",
  lint: "M01",
  "test:a11y": "M02",
  "test:api": "M06",
  "test:contract": "M22",
  "test:provider-contracts": "M23",
  "test:contracts": "M01",
  "test:db": "M03",
  "test:e2e": "M02",
  "test:evals": "M15",
  "test:integration": "M03",
  "test:property": "M06",
  "test:rls": "M03",
  "test:security": "M04",
  "test:unit": "M01",
  "test:visual": "M02",
  "temporal replay/restart/concurrency/idempotency": "M10",
  "outbox/dlq": "M10",
  "runtime load-lite": "M10",
  "kill/repair smoke": "M10",
  "restricted task/comment attachment upload": "M12",
  "checksum/quota": "M12",
  "quarantine/malware": "M12",
  authorization: "M12",
  download: "M12",
  "and lifecycle gate": "M12",
  "model contract/live-sandbox gate": "M15",
  "structured output": "M15",
  "evaluation smoke": "M15",
  "ai usage/cost and kill switch": "M15",
  "tool/credential/ssrf/sandbox security": "M16",
  "full agent evaluation": "M18",
  "release/canary/rollback": "M18",
  "file malware/parser/object lifecycle": "M19",
  "retrieval quality/acl/citation/performance": "M20",
  typecheck: "M01",
  "verify:boundaries": "M01",
  "verify:backup": "M03",
  "verify:containers": "M01",
  "verify:contracts": "M01",
  "verify:dependencies": "M01",
  "verify:events": "M01",
  "verify:evidence": "M01",
  "verify:iac": "M34",
  "verify:licenses": "M01",
  "verify:localization": "M02",
  "verify:web-performance": "M02",
  "verify:web-routes": "M02",
  "verify:migrations": "M03",
  "verify:openapi": "M01",
  "verify:query-plan": "M03",
  "verify:reproducible-build": "M01",
  "verify:secrets": "M01"
} as const satisfies Readonly<Record<string, string>>;

const milestoneNumber = (milestone: string): number => {
  const match = /^M(\d{2})$/u.exec(milestone);
  if (match?.[1] === undefined) {
    throw new Error(`Invalid milestone identifier: ${milestone}`);
  }
  return Number(match[1]);
};

const isNoOpCommand = (command: string): boolean =>
  /(^|&&|;)\s*(echo\b|exit\s+0\b|true\b)|--passWithNoTests\b/u.test(command);

export const readGateManifest = (manifestPath: string): GateManifest =>
  JSON.parse(readFileSync(manifestPath, "utf8")) as GateManifest;

export const validateGateManifest = (
  manifest: GateManifest,
  packageManifest: PackageManifest,
  workspaceRoot: string,
  activationRegistry?: GateActivationRegistry,
  evidenceDeclaration?: EvidenceDeclaration
): string[] => {
  const errors: string[] = [];
  const currentMilestone = milestoneNumber(manifest.milestone);
  const names = new Set<string>();

  if (manifest.schemaVersion !== 1) {
    errors.push(`Unsupported gate manifest schema: ${String(manifest.schemaVersion)}`);
  }

  for (const requiredName of Object.keys(ACTIVATION_MILESTONES)) {
    if (!manifest.rows.some((row) => row.name === requiredName)) {
      errors.push(`Missing required universal gate row: ${requiredName}`);
    }
  }

  for (const row of manifest.rows) {
    if (names.has(row.name)) {
      errors.push(`Duplicate gate row: ${row.name}`);
    }
    names.add(row.name);

    const declaredActivation =
      ACTIVATION_MILESTONES[row.name as keyof typeof ACTIVATION_MILESTONES];
    if (declaredActivation === undefined) {
      errors.push(`Unknown universal gate row: ${row.name}`);
    } else if (
      row.status === "NOT_YET_APPLICABLE" &&
      row.activationMilestone !== declaredActivation
    ) {
      errors.push(`Gate ${row.name} must declare activation milestone ${declaredActivation}.`);
    }

    if (row.status === "ACTIVE") {
      if (row.script === undefined) {
        errors.push(`Active gate ${row.name} has no script.`);
        continue;
      }
      const command = packageManifest.scripts?.[row.script];
      if (command === undefined) {
        errors.push(`Active gate ${row.name} references missing script ${row.script}.`);
      } else if (isNoOpCommand(command)) {
        errors.push(`Active gate ${row.name} references a no-op or empty-suite command.`);
      }

      if (row.requiredTestFiles !== undefined) {
        const matches = row.requiredTestFiles.flatMap((pattern) =>
          globSync(pattern, { cwd: workspaceRoot, exclude: ["**/node_modules/**"] })
        );
        if (matches.length === 0) {
          errors.push(`Active test gate ${row.name} has no matching test files.`);
        }
      }
    } else if (row.status === "NOT_YET_APPLICABLE") {
      if (row.activationMilestone === undefined) {
        errors.push(`Deferred gate ${row.name} has no activation milestone.`);
      } else if (milestoneNumber(row.activationMilestone) <= currentMilestone) {
        errors.push(`Deferred gate ${row.name} should already be active.`);
      }
    } else if (row.externalGateId === undefined) {
      errors.push(`Externally blocked gate ${row.name} has no external gate ID.`);
    }
  }

  if (activationRegistry !== undefined && evidenceDeclaration !== undefined) {
    if (evidenceDeclaration.milestone !== manifest.milestone) {
      errors.push("Gate manifest and evidence declaration milestones do not match.");
    }

    const normalized = (value: string): string => value.toLocaleLowerCase("en-US");
    const planRows = new Set(
      activationRegistry.entries
        .filter((entry) =>
          entry.activationMilestones.some(
            (milestone) => milestoneNumber(milestone) <= currentMilestone
          )
        )
        .map((entry) => normalized(entry.capability))
    );
    const declarationRows = new Set(evidenceDeclaration.activeGateRows.map(normalized));
    const manifestRows = new Set(
      manifest.rows
        .filter((row) => row.status === "ACTIVE" && row.declarationRow !== undefined)
        .map((row) => normalized(row.declarationRow ?? ""))
    );

    for (const planRow of planRows) {
      if (!declarationRows.has(planRow)) {
        errors.push(`Evidence declaration is missing plan-active row: ${planRow}`);
      }
      if (!manifestRows.has(planRow)) {
        errors.push(`Universal gate manifest is missing plan-active row: ${planRow}`);
      }
    }
    for (const declarationRow of declarationRows) {
      if (!planRows.has(declarationRow)) {
        errors.push(`Evidence declaration has an unplanned active row: ${declarationRow}`);
      }
    }
    for (const manifestRow of manifestRows) {
      if (!planRows.has(manifestRow)) {
        errors.push(`Universal gate manifest has an unplanned declaration row: ${manifestRow}`);
      }
    }
  }

  return errors;
};

export const runActiveGates = (
  manifest: GateManifest,
  workspaceRoot: string,
  execute: (script: string) => number = (script) =>
    spawnSync("pnpm", ["run", script], {
      cwd: workspaceRoot,
      env: { ...process.env, KNOTLINE_GATE_CHILD: "1" },
      stdio: "inherit"
    }).status ?? 1
): void => {
  for (const row of manifest.rows) {
    if (row.status !== "ACTIVE" || row.script === undefined) {
      continue;
    }
    process.stdout.write(`\n[gate] ${row.name}\n`);
    const status = execute(row.script);
    if (status !== 0) {
      throw new Error(`Gate ${row.name} failed with exit code ${String(status)}.`);
    }
  }
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = resolve(scriptDirectory, "../..");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workspaceRoot = resolve(process.env.KNOTLINE_WORKSPACE_ROOT ?? defaultWorkspaceRoot);
  const manifest = readGateManifest(resolve(scriptDirectory, "gate-manifest.json"));
  const packageManifest = JSON.parse(
    readFileSync(resolve(workspaceRoot, "package.json"), "utf8")
  ) as PackageManifest;
  const activationRegistry = JSON.parse(
    readFileSync(resolve(workspaceRoot, "contracts/generated/gate-activation.json"), "utf8")
  ) as GateActivationRegistry;
  const evidenceDeclaration = JSON.parse(
    readFileSync(
      resolve(workspaceRoot, `artifacts/verification/${manifest.milestone}/declaration.json`),
      "utf8"
    )
  ) as EvidenceDeclaration;
  const errors = validateGateManifest(
    manifest,
    packageManifest,
    workspaceRoot,
    activationRegistry,
    evidenceDeclaration
  );

  if (errors.length > 0) {
    throw new Error(`Invalid universal gate manifest:\n- ${errors.join("\n- ")}`);
  }
  if (!process.argv.includes("--check")) {
    runActiveGates(manifest, workspaceRoot);
  }
}
