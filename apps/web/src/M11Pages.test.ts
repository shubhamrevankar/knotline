import { describe, expect, it } from "vitest";

import { terminalRunGuidance } from "./M11Pages.js";

describe("run outcome guidance", () => {
  it("shows successful next steps without describing the run as stopped", () => {
    const guidance = terminalRunGuidance("succeeded");

    expect(guidance).toContain("authoritative outcome");
    expect(guidance).not.toContain("stopped step");
  });

  it("keeps remediation guidance for failed runs", () => {
    expect(terminalRunGuidance("failed")).toContain("stopped step");
  });
});
