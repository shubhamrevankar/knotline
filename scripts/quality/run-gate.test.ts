import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  readGateManifest,
  runActiveGates,
  validateGateManifest,
  type GateManifest
} from "./run-gate.js";

const activeManifest = (rows: GateManifest["rows"]): GateManifest => ({
  schemaVersion: 1,
  milestone: "M01",
  rows
});

describe("universal gate runner", () => {
  it("rejects missing, no-op, empty, duplicate, and prematurely deferred rows", () => {
    const errors = validateGateManifest(
      activeManifest([
        { name: "missing", status: "ACTIVE", script: "missing" },
        { name: "empty", status: "ACTIVE", script: "empty", requiredTestFiles: ["none/**"] },
        { name: "empty", status: "ACTIVE", script: "empty" },
        { name: "late", status: "NOT_YET_APPLICABLE", activationMilestone: "M01" },
        { name: "external", status: "BLOCKED_EXTERNAL" }
      ]),
      { scripts: { empty: "vitest run --passWithNoTests" } },
      process.cwd()
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing script"),
        expect.stringContaining("no-op or empty-suite"),
        expect.stringContaining("no matching test files"),
        expect.stringContaining("Duplicate gate row"),
        expect.stringContaining("should already be active"),
        expect.stringContaining("no external gate ID")
      ])
    );
  });

  it("runs active scripts in declaration order and stops on failure", () => {
    const execute = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(7);
    const manifest = activeManifest([
      { name: "first", status: "ACTIVE", script: "first" },
      { name: "deferred", status: "NOT_YET_APPLICABLE", activationMilestone: "M02" },
      { name: "second", status: "ACTIVE", script: "second" },
      { name: "never", status: "ACTIVE", script: "never" }
    ]);

    expect(() => runActiveGates(manifest, process.cwd(), execute)).toThrow(
      "Gate second failed with exit code 7."
    );
    expect(execute.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("accepts the canonical manifest bound to plan activation and evidence", () => {
    const workspaceRoot = process.cwd();
    const manifest = readGateManifest(resolve(workspaceRoot, "scripts/quality/gate-manifest.json"));
    const packageManifest = JSON.parse(
      readFileSync(resolve(workspaceRoot, "package.json"), "utf8")
    ) as Parameters<typeof validateGateManifest>[1];
    const activationRegistry = JSON.parse(
      readFileSync(resolve(workspaceRoot, "contracts/generated/gate-activation.json"), "utf8")
    ) as NonNullable<Parameters<typeof validateGateManifest>[3]>;
    const declaration = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, `artifacts/verification/${manifest.milestone}/declaration.json`),
        "utf8"
      )
    ) as NonNullable<Parameters<typeof validateGateManifest>[4]>;
    const errors = validateGateManifest(
      manifest,
      packageManifest,
      workspaceRoot,
      activationRegistry,
      declaration
    );

    expect(errors).toEqual([]);
  });

  it("rejects deletion of a required M01 row", () => {
    const workspaceRoot = process.cwd();
    const manifest = readGateManifest(resolve(workspaceRoot, "scripts/quality/gate-manifest.json"));
    const withoutLint = { ...manifest, rows: manifest.rows.filter((row) => row.name !== "lint") };
    const packageManifest = JSON.parse(
      readFileSync(resolve(workspaceRoot, "package.json"), "utf8")
    ) as Parameters<typeof validateGateManifest>[1];

    expect(validateGateManifest(withoutLint, packageManifest, workspaceRoot)).toContain(
      "Missing required universal gate row: lint"
    );
  });
});
