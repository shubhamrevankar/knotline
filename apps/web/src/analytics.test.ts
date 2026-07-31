import { describe, expect, it } from "vitest";

import { ANALYTICS_EVENTS, analyticsEnvelope, containsCustomerContent } from "./analytics.js";

describe("content-free analytics taxonomy", () => {
  it("uses stable event names and excludes free-form customer content", () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
    const event = analyticsEnvelope(
      { event: "public.route.viewed", routeId: "route.public.home", surface: "public" },
      new Date("2026-07-31T00:00:00.000Z")
    );
    expect(event.occurredAt).toBe("2026-07-31T00:00:00.000Z");
    expect(containsCustomerContent(event)).toBe(false);
    expect(JSON.stringify(event)).not.toContain("description");
  });
});
