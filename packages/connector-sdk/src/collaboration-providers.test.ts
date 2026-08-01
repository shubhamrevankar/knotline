import { describe, expect, it } from "vitest";
import {
  COLLABORATION_ACTION_POLICIES,
  COLLABORATION_EXTERNAL_GATES,
  COLLABORATION_PROVIDER_MANIFESTS,
  GitHubInstallationRouter,
  actionPreview,
  assertFreshActionTarget,
  availableXActions,
  certifyCollaborationProvider,
  escapeProviderText,
  mapProviderIdentity,
  paginateProviderObjects,
  prioritizeAclRevocation,
  selectProviderMetadata
} from "./collaboration-providers.js";

const providers = ["linear", "jira-cloud", "github", "slack", "microsoft-teams", "x"] as const;

describe("recorded work and collaboration providers", () => {
  it("declares each provider without claiming live certification", () => {
    for (const provider of providers) {
      const manifest = COLLABORATION_PROVIDER_MANIFESTS[provider];
      expect(manifest.capabilities).toEqual(
        expect.arrayContaining(["read", "write", "permissions", "reconcile"])
      );
      expect(manifest.objectTypes.length).toBeGreaterThan(2);
      expect(COLLABORATION_EXTERNAL_GATES[provider]).toMatch(/^EXT-/u);
    }
  });

  it("documents risk, scope, approval, receipt, and compensation for every write", () => {
    for (const provider of providers)
      expect(COLLABORATION_ACTION_POLICIES[provider]).toHaveLength(
        COLLABORATION_PROVIDER_MANIFESTS[provider].actions.length
      );
    expect(
      COLLABORATION_ACTION_POLICIES["jira-cloud"].find(
        ({ action }) => action === "issue.transition"
      )
    ).toMatchObject({ risk: "high", approval: "required" });
  });

  it("uses expiry-aware cached metadata only for safe browsing", () => {
    const cached = {
      accountId: "acct",
      fetchedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-01T01:00:00Z",
      revision: "2",
      values: ["target"]
    };
    expect(
      selectProviderMetadata(undefined, cached, new Date("2026-01-01T02:00:00Z"))
    ).toMatchObject({ stale: true, writable: false });
    expect(() => selectProviderMetadata(undefined, undefined)).toThrow(
      "PROVIDER_METADATA_UNAVAILABLE"
    );
  });

  it("rejects stale metadata, wrong account, and missing write scope", () => {
    const metadata = {
      accountId: "acct",
      fetchedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2027-01-01T00:00:00Z",
      revision: "2",
      values: []
    };
    const policy = COLLABORATION_ACTION_POLICIES.linear[0]!;
    expect(() =>
      assertFreshActionTarget({
        expectedAccountId: "wrong",
        expectedRevision: "2",
        metadata,
        scopes: [policy.requiredScope],
        policy
      })
    ).toThrow("PROVIDER_ACCOUNT_MISMATCH");
    expect(() =>
      assertFreshActionTarget({
        expectedAccountId: "acct",
        expectedRevision: "1",
        metadata,
        scopes: [policy.requiredScope],
        policy
      })
    ).toThrow("STALE_PROVIDER_METADATA");
    expect(() =>
      assertFreshActionTarget({
        expectedAccountId: "acct",
        expectedRevision: "2",
        metadata,
        scopes: [],
        policy
      })
    ).toThrow("PROVIDER_SCOPE_REQUIRED");
  });

  it("maps provider identities only by verified identifier or explicit administration", () => {
    expect(
      mapProviderIdentity(
        {
          provider: "slack",
          providerAccountId: "w",
          providerUserId: "u",
          verifiedIdentifier: "maya@example.test"
        },
        { "maya@example.test": "user-1" }
      )
    ).toEqual({ userId: "user-1", method: "verified-identifier" });
    expect(() =>
      mapProviderIdentity({ provider: "slack", providerAccountId: "w", providerUserId: "u" }, {})
    ).toThrow("PROVIDER_IDENTITY_UNVERIFIED");
  });

  it("escapes active content and mass mentions", () => {
    const safe = escapeProviderText("<script>alert(1)</script> @everyone <!channel>");
    expect(safe).not.toContain("<script>");
    expect(safe).not.toContain("<!channel>");
    expect(safe).toContain("@\u200beveryone");
  });

  it("previews exact account, target, semantic diff, and action policy", () => {
    const preview = actionPreview({
      provider: "github",
      accountId: "installation-7",
      targetId: "org/repo#12",
      action: "comment.create",
      before: { body: "old", unchanged: 1 },
      after: { body: "new", unchanged: 1 }
    });
    expect(preview).toMatchObject({ accountId: "installation-7", targetId: "org/repo#12" });
    expect(preview.diff).toEqual([{ field: "body", before: "old", after: "new" }]);
  });

  it("never exposes unsupported X tier operations", () => {
    expect(availableXActions({ reads: true, writes: false, deletes: false })).toEqual([
      "post.read"
    ]);
    expect(availableXActions({ reads: true, writes: true, deletes: false })).not.toContain(
      "post.delete"
    );
  });

  it("prioritizes ACL revocation and deletion over indexing backlog", () => {
    const events = prioritizeAclRevocation([
      { kind: "content" as const, sequence: 1 },
      { kind: "permission" as const, sequence: 3 },
      { kind: "delete" as const, sequence: 2 }
    ]);
    expect(events.map(({ kind }) => kind)).toEqual(["delete", "permission", "content"]);
  });

  it("handles pagination, rate limits, and cursor loops deterministically", () => {
    expect(paginateProviderObjects([{ values: [1], cursor: "next" }, { values: [2] }])).toEqual([
      1, 2
    ]);
    expect(() => paginateProviderObjects([{ values: [], retryAfterSeconds: 7 }])).toThrow(
      "PROVIDER_RATE_LIMIT:7"
    );
    expect(() =>
      paginateProviderObjects([
        { values: [], cursor: "x" },
        { values: [], cursor: "x" }
      ])
    ).toThrow("PROVIDER_PAGINATION_LOOP");
  });

  it("routes a delayed GitHub delivery through the historical installation binding", () => {
    const router = new GitHubInstallationRouter();
    const bindings = [
      {
        workspaceId: "workspace-a",
        connectionId: "connection-a",
        installationId: "42",
        applicationId: "app",
        environment: "prod",
        activeFrom: 100,
        activeTo: 200
      },
      {
        workspaceId: "workspace-a",
        connectionId: "connection-b",
        installationId: "42",
        applicationId: "app",
        environment: "prod",
        activeFrom: 200
      }
    ];
    expect(
      router.route(bindings, {
        applicationId: "app",
        environment: "prod",
        installationId: "42",
        deliveryId: "delivery-1",
        eventTime: 150
      })
    ).toMatchObject({ connectionId: "connection-a", bindingVersion: 100 });
    expect(() =>
      router.route(bindings, {
        applicationId: "app",
        environment: "prod",
        installationId: "42",
        deliveryId: "delivery-1",
        eventTime: 150
      })
    ).toThrow("GITHUB_DELIVERY_REPLAY");
  });

  it("rejects zero or multiple GitHub installation mappings", () => {
    const router = new GitHubInstallationRouter();
    expect(() =>
      router.route([], {
        applicationId: "app",
        environment: "prod",
        installationId: "42",
        deliveryId: "x",
        eventTime: 1
      })
    ).toThrow("WEBHOOK_BINDING_AMBIGUOUS");
  });

  it("certifies every declared action through uncertain outcome and reconciliation", () => {
    for (const provider of providers) {
      const result = certifyCollaborationProvider(provider);
      expect(result.liveStatus).toBe("BLOCKED_EXTERNAL");
      expect(result.reconciled).toBe(true);
      expect(result.receipts).toHaveLength(
        COLLABORATION_PROVIDER_MANIFESTS[provider].actions.length
      );
    }
  });
});
