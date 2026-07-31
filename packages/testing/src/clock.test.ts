import { describe, expect, it, vi } from "vitest";

import { FakeClock } from "./clock.js";

describe("FakeClock", () => {
  it("advances deterministically and returns defensive Date values", () => {
    const clock = new FakeClock("2026-01-01T00:00:00.000Z");
    const observed = clock.now();
    observed.setUTCFullYear(2030);

    clock.advanceBy(1_250);

    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:01.250Z");
    expect(clock.nowMs()).toBe(Date.parse("2026-01-01T00:00:01.250Z"));
  });

  it("resolves due sleeps in insertion order", async () => {
    const clock = new FakeClock(1_000);
    const events: string[] = [];
    void clock.sleep(20).then(() => events.push("first"));
    void clock.sleep(20).then(() => events.push("second"));
    void clock.sleep(30).then(() => events.push("third"));

    clock.advanceBy(20);
    await vi.waitFor(() => expect(events).toEqual(["first", "second"]));
    expect(clock.pendingSleepCount()).toBe(1);

    clock.set(1_030);
    await vi.waitFor(() => expect(events).toEqual(["first", "second", "third"]));
    expect(clock.pendingSleepCount()).toBe(0);
  });

  it("handles zero sleeps and rejects invalid movement", async () => {
    const clock = new FakeClock(10);

    await expect(clock.sleep(0)).resolves.toBeUndefined();
    expect(() => clock.advanceBy(-1)).toThrow(RangeError);
    expect(() => clock.set(9)).toThrow(RangeError);
    expect(() => new FakeClock("not-an-instant")).toThrow(TypeError);
  });
});
