import { describe, expect, it, vi } from "vitest";

import { observedQuery, queryFingerprint } from "./client.js";

describe("safe query telemetry", () => {
  it("does not encode literal values in fingerprints", () => {
    expect(queryFingerprint("select * from x where email = 'first@example.test' and n = 12")).toBe(
      queryFingerprint("select * from x where email = 'second@example.test' and n = 94")
    );
  });

  it("records timing, fingerprint, row count, and outcome only", async () => {
    const observer = vi.fn();
    await observedQuery(
      () => Promise.resolve({ rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] }),
      "SELECT secret FROM tokens WHERE token = $1",
      observer
    );
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "success", rowCount: 0 })
    );
    expect(JSON.stringify(observer.mock.calls)).not.toContain("secret-value");
  });
});
