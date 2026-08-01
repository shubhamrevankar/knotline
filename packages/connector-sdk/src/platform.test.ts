import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DurableSync,
  OAuthTransactionStore,
  WebhookReplayGuard,
  certifyConnector,
  classifyProviderError,
  adaptivePollInterval,
  assertNoCrossWorkspaceRebind,
  fairSchedule,
  reconcileScopes,
  redactConnectorRecord,
  resolveHistoricalInstallation,
  retryDelay,
  stagedRolloutSelected,
  validateManifest
} from "./platform.js";

const manifest = validateManifest({
  key: "fixture-cloud",
  version: "1.0.0",
  displayName: "Fixture Cloud",
  provider: "fixture",
  authMethods: ["oauth2"],
  capabilities: ["discover", "read", "webhook", "poll", "permissions", "reconcile"],
  requiredScopes: ["objects.read"],
  optionalScopes: ["profile.read"],
  objectTypes: ["page"],
  triggers: ["page.changed"],
  actions: [],
  permissionFidelity: "exact",
  webhookMode: "application",
  regions: ["local"],
  rateLimits: { concurrency: 2, requestsPerMinute: 60 },
  oauth: {
    authorizationEndpoint: "https://fixture.invalid/oauth",
    tokenEndpoint: "https://fixture.invalid/token"
  }
});

const binding = {
  workspaceId: "w1",
  userId: "u1",
  sessionId: "s1",
  browserNonce: "browser-nonce-1234",
  connectionId: "c1",
  connectorKey: manifest.key,
  manifestVersion: manifest.version,
  provider: manifest.provider,
  clientApplicationId: "local-app",
  configVersion: "v1",
  redirectUri: "http://127.0.0.1/callback",
  requestedScopes: ["objects.read"],
  returnTarget: "/app/connections/c1",
  expiresAt: "2030-01-01T00:00:00.000Z"
};
const expected = {
  workspaceId: "w1",
  userId: "u1",
  sessionId: "s1",
  browserNonce: "browser-nonce-1234",
  connectionId: "c1",
  connectorKey: manifest.key,
  manifestVersion: manifest.version,
  provider: manifest.provider,
  clientApplicationId: "local-app",
  configVersion: "v1",
  redirectUri: "http://127.0.0.1/callback"
};

describe("secure connector platform", () => {
  it("requires declared OAuth endpoints and rejects scope escalation", () => {
    expect(manifest.permissionFidelity).toBe("exact");
    expect(() => validateManifest({ ...manifest, oauth: undefined })).toThrow();
    expect(() => reconcileScopes(manifest, ["admin"], ["admin"])).toThrow("SCOPE_ESCALATION");
    expect(
      reconcileScopes(manifest, ["objects.read", "profile.read"], ["objects.read"])
    ).toMatchObject({ reduced: true, reauthorizationRequired: false });
    expect(reconcileScopes(manifest, ["objects.read"], [])).toMatchObject({
      missingRequired: ["objects.read"],
      reauthorizationRequired: true
    });
  });

  it("binds PKCE state to every security dimension and consumes exactly once", () => {
    const store = new OAuthTransactionStore(
      Buffer.from("a".repeat(32)),
      () => new Date("2029-01-01")
    );
    const started = store.start(binding);
    expect(started.challenge).not.toBe(started.verifier);
    expect(store.consume(started.state, expected, started.verifier).workspaceId).toBe("w1");
    expect(() => store.consume(started.state, expected, started.verifier)).toThrow(
      "OAUTH_STATE_REPLAY"
    );
  });

  it.each([
    "workspaceId",
    "sessionId",
    "browserNonce",
    "connectionId",
    "manifestVersion",
    "clientApplicationId",
    "configVersion",
    "redirectUri"
  ] as const)("rejects OAuth %s mix-up", (key) => {
    const store = new OAuthTransactionStore(
      Buffer.from("b".repeat(32)),
      () => new Date("2029-01-01")
    );
    const started = store.start(binding);
    expect(() =>
      store.consume(started.state, { ...expected, [key]: "swapped" }, started.verifier)
    ).toThrow("OAUTH_BINDING_MISMATCH");
  });

  it("rejects unsafe returns, expiry, tampering, and the wrong verifier", () => {
    const store = new OAuthTransactionStore(
      Buffer.from("c".repeat(32)),
      () => new Date("2029-01-01")
    );
    expect(() => store.start({ ...binding, returnTarget: "https://evil.invalid" })).toThrow(
      "UNSAFE_RETURN_TARGET"
    );
    expect(() => store.start({ ...binding, expiresAt: "2020-01-01T00:00:00Z" })).toThrow(
      "AUTHORIZATION_EXPIRED"
    );
    const started = store.start(binding);
    expect(() => store.consume(`${started.state}x`, expected, started.verifier)).toThrow(
      "INVALID_OAUTH_STATE"
    );
    expect(() => store.consume(started.state, expected, "wrong-verifier")).toThrow("PKCE_MISMATCH");
  });

  it("authenticates exact raw webhook bytes before replay detection", () => {
    let now = 1_700_000_000_000;
    const guard = new WebhookReplayGuard(300, () => now);
    const secret = Buffer.from("fixture-secret");
    const rawBody = Buffer.from('{"installation":"i-1"}');
    const timestamp = now / 1000;
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest("hex");
    const input = {
      endpointId: "ep",
      applicationId: "app",
      environment: "local",
      timestamp,
      rawBody,
      signature
    };
    expect(guard.verify(input, secret)).toHaveLength(64);
    expect(() => guard.verify(input, secret)).toThrow("WEBHOOK_REPLAY");
    expect(() =>
      new WebhookReplayGuard(300, () => now).verify(
        { ...input, rawBody: Buffer.from("{}") },
        secret
      )
    ).toThrow("INVALID_WEBHOOK_SIGNATURE");
    now += 301_000;
    expect(() => new WebhookReplayGuard(300, () => now).verify(input, secret)).toThrow(
      "STALE_WEBHOOK"
    );
  });

  it("routes only one historical application binding and fails closed without order", () => {
    const bindings = [
      {
        workspaceId: "w1",
        connectionId: "c1",
        installationId: "i",
        applicationId: "a",
        environment: "local",
        activeFrom: 10,
        activeTo: 20
      },
      {
        workspaceId: "w1",
        connectionId: "c2",
        installationId: "i",
        applicationId: "a",
        environment: "local",
        activeFrom: 20
      }
    ];
    expect(
      resolveHistoricalInstallation(bindings, {
        installationId: "i",
        applicationId: "a",
        environment: "local",
        eventTime: 15
      }).connectionId
    ).toBe("c1");
    expect(() =>
      resolveHistoricalInstallation(bindings, {
        installationId: "i",
        applicationId: "a",
        environment: "local"
      })
    ).toThrow("WEBHOOK_ORDER_AMBIGUOUS");
    expect(() =>
      resolveHistoricalInstallation([...bindings, { ...bindings[1]!, connectionId: "c3" }], {
        installationId: "i",
        applicationId: "a",
        environment: "local",
        eventTime: 25
      })
    ).toThrow("WEBHOOK_BINDING_AMBIGUOUS");
  });

  it("forbids cross-workspace installation reuse and schedules tenants fairly", () => {
    const prior = [
      {
        workspaceId: "w1",
        connectionId: "c1",
        installationId: "i",
        applicationId: "a",
        environment: "local",
        activeFrom: 1
      }
    ];
    expect(() =>
      assertNoCrossWorkspaceRebind(prior, {
        workspaceId: "w2",
        installationId: "i",
        applicationId: "a",
        environment: "local"
      })
    ).toThrow("CROSS_WORKSPACE_INSTALLATION_REASSIGNMENT");
    expect(
      fairSchedule(
        [
          { workspaceId: "w1", connectionId: "1" },
          { workspaceId: "w1", connectionId: "2" },
          { workspaceId: "w2", connectionId: "3" }
        ],
        3
      ).map((item) => item.connectionId)
    ).toEqual(["1", "3", "2"]);
  });

  it("adapts polling and selects staged versions deterministically", () => {
    expect(adaptivePollInterval(0, 60_000, 3_600_000, 0)).toBe(3_600_000);
    expect(adaptivePollInterval(10, 60_000, 3_600_000, 0)).toBe(60_000);
    expect(stagedRolloutSelected("workspace-a", "2.0.0", 100)).toBe(true);
    expect(stagedRolloutSelected("workspace-a", "2.0.0", 0)).toBe(false);
    expect(stagedRolloutSelected("workspace-a", "2.0.0", 50)).toBe(
      stagedRolloutSelected("workspace-a", "2.0.0", 50)
    );
  });

  it("checkpoints ordered pages idempotently and reconciles divergence", () => {
    const sync = new DurableSync();
    const object = {
      externalId: "1",
      version: "v1",
      objectType: "page",
      permissionHash: "acl-1",
      payload: { title: "A" }
    };
    expect(sync.applyPage("p1", { objects: [object], nextCursor: "cursor-1" })).toMatchObject({
      applied: 1,
      sequence: 1
    });
    expect(sync.applyPage("p1", { objects: [object], nextCursor: "bad" })).toMatchObject({
      duplicate: true,
      sequence: 1
    });
    expect(
      sync.applyPage("p2", { objects: [{ ...object, permissionHash: "acl-2" }] })
    ).toMatchObject({ applied: 1, sequence: 2 });
    expect(
      sync.reconcile([
        { ...object, version: "v2" },
        { ...object, externalId: "2" }
      ])
    ).toBe(2);
    expect(sync.reconcile([])).toBe(2);
  });

  it("standardizes retry, errors, and credential-safe diagnostics", () => {
    expect(retryDelay(4, 12)).toBe(12_000);
    expect(retryDelay(2, undefined, 42)).toBe(4_042);
    expect([401, 403, 404, 429, 503, 400].map(classifyProviderError)).toEqual([
      "auth",
      "permission",
      "deleted_object",
      "rate_limit",
      "outage",
      "bug"
    ]);
    expect(
      redactConnectorRecord({ accessToken: "x", client_secret: "y", account: "safe" })
    ).toEqual({ accessToken: "[REDACTED]", client_secret: "[REDACTED]", account: "safe" });
  });

  it("certifies a permission-aware fixture including ACL-REVOKE-1", async () => {
    const result = await certifyConnector({
      manifest,
      discover() {
        return Promise.resolve(["page"]);
      },
      readPage() {
        return Promise.resolve({
          objects: [
            {
              externalId: "1",
              version: "1",
              objectType: "page",
              permissionHash: "public",
              payload: {}
            }
          ]
        });
      },
      injectAclRevocation() {
        return Promise.resolve({ observedAt: new Date().toISOString() });
      }
    });
    expect(result).toEqual({
      certified: true,
      objectTypes: ["page"],
      fixtureObjects: 1,
      aclRevoke: true
    });
    await expect(
      certifyConnector({
        manifest,
        discover() {
          return Promise.resolve(["page"]);
        },
        readPage() {
          return Promise.resolve({ objects: [] });
        }
      })
    ).rejects.toThrow("ACL-REVOKE-1_REQUIRED");
  });
});
