import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { globSync, readFileSync, rmSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD_DIRECTORY_PATTERN = "{apps,packages}/*/dist";
const BUILD_ARTIFACT_PATTERN = `${BUILD_DIRECTORY_PATTERN}/**/*`;

const run = (workspaceRoot: string, command: string, args: readonly string[]): string => {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"]
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${String(result.status)}.`);
  }
  return result.stdout;
};

export const hashBuildArtifacts = (workspaceRoot: string): Readonly<Record<string, string>> => {
  const artifactPaths = globSync(BUILD_ARTIFACT_PATTERN, {
    cwd: workspaceRoot,
    exclude: ["**/*.tsbuildinfo"]
  })
    .filter((artifactPath) => statSync(resolve(workspaceRoot, artifactPath)).isFile())
    .sort();
  if (artifactPaths.length === 0) {
    throw new Error("Build produced no distributable artifacts.");
  }

  return Object.fromEntries(
    artifactPaths.map((artifactPath) => [
      artifactPath,
      createHash("sha256")
        .update(readFileSync(resolve(workspaceRoot, artifactPath)))
        .digest("hex")
    ])
  );
};

export const removeBuildDirectories = (workspaceRoot: string): void => {
  const relativeDirectories = globSync(BUILD_DIRECTORY_PATTERN, { cwd: workspaceRoot });
  for (const relativeDirectory of relativeDirectories) {
    if (!/^(?:apps|packages)\/[^/]+\/dist$/u.test(relativeDirectory)) {
      throw new Error(`Refusing to remove unexpected build path: ${relativeDirectory}`);
    }
    const target = resolve(workspaceRoot, relativeDirectory);
    const workspaceRelative = relative(workspaceRoot, target);
    if (workspaceRelative.startsWith(`..${sep}`) || workspaceRelative === "..") {
      throw new Error(`Refusing to remove path outside workspace: ${target}`);
    }
    rmSync(target, { force: true, recursive: true });
  }
};

const removeBuildMetadata = (workspaceRoot: string): void => {
  const metadataPaths = globSync("{apps,packages}/*/**/*.tsbuildinfo", { cwd: workspaceRoot });
  for (const metadataPath of metadataPaths) {
    const target = resolve(workspaceRoot, metadataPath);
    const workspaceRelative = relative(workspaceRoot, target);
    if (
      !/^(?:apps|packages)\/[^/]+\/.+\.tsbuildinfo$/u.test(metadataPath) ||
      workspaceRelative.startsWith(`..${sep}`) ||
      workspaceRelative === ".."
    ) {
      throw new Error(`Refusing to remove unexpected build metadata: ${metadataPath}`);
    }
    rmSync(target, { force: true });
  }
};

export const verifyReproducibleBuild = (
  workspaceRoot: string,
  build: () => void = () => {
    run(workspaceRoot, "pnpm", ["run", "build"]);
  }
): void => {
  const trackedBefore = run(workspaceRoot, "git", ["diff", "--no-ext-diff", "--binary", "--"]);
  const stagedBefore = run(workspaceRoot, "git", [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--binary",
    "--"
  ]);
  const statusBefore = run(workspaceRoot, "git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all"
  ]);

  removeBuildMetadata(workspaceRoot);
  removeBuildDirectories(workspaceRoot);
  build();
  const firstBuild = hashBuildArtifacts(workspaceRoot);
  removeBuildDirectories(workspaceRoot);
  build();
  const secondBuild = hashBuildArtifacts(workspaceRoot);

  if (JSON.stringify(firstBuild) !== JSON.stringify(secondBuild)) {
    throw new Error("Successive production builds produced different artifact digests.");
  }
  const buildMetadata = globSync("**/*.tsbuildinfo", {
    cwd: workspaceRoot,
    exclude: ["**/node_modules/**"]
  });
  if (buildMetadata.length > 0) {
    throw new Error(`Build leaked TypeScript metadata: ${buildMetadata.join(", ")}`);
  }

  const trackedAfter = run(workspaceRoot, "git", ["diff", "--no-ext-diff", "--binary", "--"]);
  const stagedAfter = run(workspaceRoot, "git", [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--binary",
    "--"
  ]);
  const statusAfter = run(workspaceRoot, "git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all"
  ]);
  if (
    trackedAfter !== trackedBefore ||
    stagedAfter !== stagedBefore ||
    statusAfter !== statusBefore
  ) {
    throw new Error("Production build modified tracked source or created untracked files.");
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyReproducibleBuild(resolve(process.env.KNOTLINE_WORKSPACE_ROOT ?? process.cwd()));
}
