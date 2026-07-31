import { describe, expect, it } from "vitest";

import { REQUIRED_STORES, validateDataStoreRegistry } from "./registry.js";

describe("durable data-store registry", () => {
  it("covers every durable table with retention, export, deletion, and ownership", async () => {
    const registry = await validateDataStoreRegistry();
    expect(registry.stores).toHaveLength(REQUIRED_STORES.length);
    expect(registry.indexes.length).toBeGreaterThan(10);
  });
});
