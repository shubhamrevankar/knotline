import { describe, expect, it } from "vitest";

import { safeReturnTarget } from "./return-target.js";

describe("safe return targets", () => {
  it("accepts internal paths and preserves non-sensitive context", () => {
    expect(safeReturnTarget("/app/runs?status=failed#attempts")).toBe(
      "/app/runs?status=failed#attempts"
    );
  });

  it("rejects external, protocol-relative, malformed, and backslash targets", () => {
    for (const target of [
      "https://attacker.example",
      "//attacker.example/path",
      "/\\attacker.example",
      "javascript:alert(1)"
    ]) {
      expect(safeReturnTarget(target)).toBe("/app");
    }
  });

  it("removes sensitive query parameters", () => {
    expect(safeReturnTarget("/app?filter=open&token=secret&code=oauth")).toBe("/app?filter=open");
  });
});
