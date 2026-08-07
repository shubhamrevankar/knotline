import { describe, expect, it } from "vitest";

import { isRuntimeConnectionReady } from "./runtime-repository.js";

describe("isRuntimeConnectionReady", () => {
  it("accepts active OAuth provider connections with encrypted credentials", () => {
    expect(
      isRuntimeConnectionReady({
        connectorKey: "slack-collaboration",
        state: "active",
        hasCredential: true,
        endpoint: null
      })
    ).toBe(true);
    expect(
      isRuntimeConnectionReady({
        connectorKey: "hubspot-crm",
        state: "degraded",
        hasCredential: true,
        endpoint: null
      })
    ).toBe(true);
  });

  it("rejects provider connections without credentials", () => {
    expect(
      isRuntimeConnectionReady({
        connectorKey: "slack-collaboration",
        state: "active",
        hasCredential: false,
        endpoint: null
      })
    ).toBe(false);
  });

  it("continues to require endpoints for HTTP connections", () => {
    expect(
      isRuntimeConnectionReady({
        connectorKey: "generic-rest",
        state: "active",
        hasCredential: true,
        endpoint: "https://example.com/webhook"
      })
    ).toBe(true);
    expect(
      isRuntimeConnectionReady({
        connectorKey: "generic-rest",
        state: "active",
        hasCredential: true,
        endpoint: null
      })
    ).toBe(false);
  });

  it("rejects disabled connections regardless of configuration", () => {
    expect(
      isRuntimeConnectionReady({
        connectorKey: "slack-collaboration",
        state: "disabled",
        hasCredential: true,
        endpoint: null
      })
    ).toBe(false);
  });
});
