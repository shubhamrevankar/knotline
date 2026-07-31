import { describe, expect, it, vi } from "vitest";

import { measurementAllowed, readConsent, writeConsent } from "./consent.js";

describe("consent preference", () => {
  it("is explicit, durable, and honors do-not-track", () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    expect(readConsent(storage)).toBeNull();
    writeConsent(storage, "measurement");
    expect(storage.setItem).toHaveBeenCalledWith("knotline.consent.v1", "measurement");
    expect(measurementAllowed("measurement", "1")).toBe(false);
    expect(measurementAllowed("measurement", "0")).toBe(true);
    expect(measurementAllowed("essential", "0")).toBe(false);
  });
});
