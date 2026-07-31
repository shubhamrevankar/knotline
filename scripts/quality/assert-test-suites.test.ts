import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findEmptyRequiredTestSuites } from "./assert-test-suites.js";

const writeWorkspace = (root: string, name: string, withTest: boolean): void => {
  const directory = join(root, "packages", name);
  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: `@knotline/${name}`, scripts: { "test:unit": "vitest run src" } })
  );
  if (withTest) {
    writeFileSync(join(directory, "src", "index.test.ts"), "export {};\n");
  }
};

describe("required unit suite validation", () => {
  it("reports packages that declare a unit suite without test files", () => {
    const workspace = mkdtempSync(join(tmpdir(), "knotline-empty-suite-"));
    writeWorkspace(workspace, "covered", true);
    writeWorkspace(workspace, "empty", false);

    expect(findEmptyRequiredTestSuites(workspace)).toEqual(["@knotline/empty"]);
  });
});
