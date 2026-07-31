import { FakeClock } from "./clock.js";

export interface TenantFixture {
  readonly id: string;
  readonly slug: string;
  readonly owner: {
    readonly id: string;
    readonly email: string;
  };
  readonly workflow: {
    readonly id: string;
    readonly externalReference: string;
    readonly name: string;
  };
}

export interface TwoTenantFixture {
  readonly clock: FakeClock;
  readonly primary: TenantFixture;
  readonly secondary: TenantFixture;
  readonly tenants: readonly [TenantFixture, TenantFixture];
}

const createTenant = (suffix: "1" | "2", slug: string): TenantFixture => ({
  id: `10000000-0000-4000-8000-00000000000${suffix}`,
  slug,
  owner: {
    id: `20000000-0000-4000-8000-00000000000${suffix}`,
    email: `owner-${suffix}@example.test`
  },
  workflow: {
    id: `30000000-0000-4000-8000-00000000000${suffix}`,
    externalReference: "shared-reference",
    name: "Identical workflow name"
  }
});

export const createTwoTenantFixture = (): TwoTenantFixture => {
  const primary = createTenant("1", "granite-labs");
  const secondary = createTenant("2", "harbor-works");

  return {
    clock: new FakeClock("2026-03-14T09:26:53.000Z"),
    primary,
    secondary,
    tenants: [primary, secondary]
  };
};
