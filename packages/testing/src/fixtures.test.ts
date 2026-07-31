import { describe, expect, it } from "vitest";

import { createTwoTenantFixture } from "./fixtures.js";

describe("two-tenant fixture", () => {
  it("is deterministic and deliberately uses same-shaped adversarial records", () => {
    const fixture = createTwoTenantFixture();
    const replay = createTwoTenantFixture();

    expect(fixture).toEqual(replay);
    expect(fixture.primary.id).not.toBe(fixture.secondary.id);
    expect(fixture.primary.id.length).toBe(fixture.secondary.id.length);
    expect(fixture.primary.workflow.externalReference).toBe(
      fixture.secondary.workflow.externalReference
    );
    expect(fixture.primary.workflow.name).toBe(fixture.secondary.workflow.name);
    expect(fixture.tenants).toEqual([fixture.primary, fixture.secondary]);
  });
});
