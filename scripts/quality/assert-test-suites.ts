import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface WorkspaceManifest {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
}

export const findEmptyRequiredTestSuites = (workspaceRoot: string): string[] => {
  const emptySuites: string[] = [];
  const manifestPaths = globSync("{apps,packages}/*/package.json", { cwd: workspaceRoot });

  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(
      readFileSync(resolve(workspaceRoot, manifestPath), "utf8")
    ) as WorkspaceManifest;
    if (manifest.scripts?.["test:unit"] === undefined) {
      continue;
    }

    const packageDirectory = manifestPath.slice(0, -"package.json".length);
    const testFiles = globSync("src/**/*.test.{ts,tsx,js,jsx,mjs,cjs}", {
      cwd: resolve(workspaceRoot, packageDirectory)
    });
    if (testFiles.length === 0) {
      emptySuites.push(manifest.name ?? packageDirectory.replace(/\/$/u, ""));
    }
  }

  return emptySuites.sort();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workspaceRoot = resolve(process.env.KNOTLINE_WORKSPACE_ROOT ?? process.cwd());
  const emptySuites = findEmptyRequiredTestSuites(workspaceRoot);
  if (emptySuites.length > 0) {
    throw new Error(`Required unit suites contain no tests: ${emptySuites.join(", ")}`);
  }
}
