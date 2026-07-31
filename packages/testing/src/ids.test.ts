import { describe, expect, it } from "vitest";

import { DeterministicIdGenerator } from "./ids.js";

describe("DeterministicIdGenerator", () => {
  it("replays the same UUID sequence for the same seed", () => {
    const first = new DeterministicIdGenerator("stable-seed");
    const replay = new DeterministicIdGenerator("stable-seed");

    expect([first.next("tenant"), first.next("workflow")]).toEqual([
      replay.next("tenant"),
      replay.next("workflow")
    ]);
    expect(first.next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

  it("creates namespaced prefixed IDs and validates caller input", () => {
    const ids = new DeterministicIdGenerator();

    expect(ids.nextPrefixed("run_attempt")).toMatch(/^run_attempt_[0-9a-f-]{36}$/u);
    expect(() => ids.nextPrefixed("Run")).toThrow(RangeError);
    expect(() => ids.next("")).toThrow(RangeError);
    expect(() => new DeterministicIdGenerator("")).toThrow(RangeError);
  });
});
