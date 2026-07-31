import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hashBuildArtifacts,
  removeBuildDirectories,
  verifyReproducibleBuild
} from "./verify-reproducible-build.js";

const createRepository = (): string => {
  const workspace = mkdtempSync(join(tmpdir(), "knotline-build-repo-"));
  writeFileSync(join(workspace, "README.md"), "fixture\n");
  writeFileSync(join(workspace, ".gitignore"), "dist\n");
  for (const args of [
    ["init", "--quiet"],
    ["add", "README.md", ".gitignore"],
    [
      "-c",
      "user.name=Quality Test",
      "-c",
      "user.email=quality@example.test",
      "commit",
      "--quiet",
      "-m",
      "fixture"
    ]
  ]) {
    const result = spawnSync("git", args, { cwd: workspace });
    if (result.status !== 0) {
      throw new Error(`Could not create fixture repository: git ${args.join(" ")}`);
    }
  }
  return workspace;
};

const writeBuild = (workspace: string, value: string): void => {
  const dist = join(workspace, "packages", "example", "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.js"), `export const value = ${value};\n`);
};

describe("reproducible build verifier", () => {
  it("hashes stable artifact paths and removes only validated dist directories", () => {
    const workspace = mkdtempSync(join(tmpdir(), "knotline-build-hash-"));
    const dist = join(workspace, "packages", "example", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.js"), "export const value = 1;\n");

    const first = hashBuildArtifacts(workspace);
    expect(hashBuildArtifacts(workspace)).toEqual(first);
    expect(first).toHaveProperty("packages/example/dist/index.js");

    removeBuildDirectories(workspace);
    expect(() => hashBuildArtifacts(workspace)).toThrow(
      "Build produced no distributable artifacts."
    );
  });

  it("accepts two identical builds without changing repository state", () => {
    const workspace = createRepository();

    expect(() =>
      verifyReproducibleBuild(workspace, () => writeBuild(workspace, "1"))
    ).not.toThrow();
  });

  it("rejects different successive artifact content", () => {
    const workspace = createRepository();
    let buildNumber = 0;

    expect(() =>
      verifyReproducibleBuild(workspace, () => {
        buildNumber += 1;
        writeBuild(workspace, String(buildNumber));
      })
    ).toThrow("Successive production builds produced different artifact digests.");
  });
});
