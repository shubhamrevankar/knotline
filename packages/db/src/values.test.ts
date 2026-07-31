import { describe, expect, it } from "vitest";

import { assertOptimisticVersion, canonicalJson, contentHash } from "./values.js";

describe("database value helpers", () => {
  it("creates stable canonical JSON and hashes independent of key order", () => {
    expect(canonicalJson({ z: [2, 1], a: { y: true, x: null } })).toBe(
      '{"a":{"x":null,"y":true},"z":[2,1]}'
    );
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
  });

  it("enforces optimistic versions", () => {
    expect(() => assertOptimisticVersion(2, 2)).not.toThrow();
    expect(() => assertOptimisticVersion(1, 2)).toThrow("OPTIMISTIC_VERSION_CONFLICT");
    expect(() => assertOptimisticVersion(0, 0)).toThrow("Invalid expected version");
  });
});
