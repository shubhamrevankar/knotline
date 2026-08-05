import { describe, expect, it, vi } from "vitest";

import {
  exchangeProviderCode,
  executeProviderAction,
  fetchProviderObjects,
  providerAuthorizationUrl,
  refreshProviderCredential,
  testProviderCredential,
  type ProviderCredential
} from "./live-providers.js";

const application = {
  clientId: "client-id",
  clientSecret: "local-only-client-secret",
  redirectUri: "https://product.example/callbacks/slack"
};

const requestUrl = (value: URL | RequestInfo) =>
  typeof value === "string" ? value : value instanceof URL ? value.toString() : value.url;
const requestBody = (value: BodyInit | null | undefined) =>
  typeof value === "string" ? value : value instanceof URLSearchParams ? value.toString() : "";

const slackCredential: ProviderCredential = {
  provider: "slack",
  accessToken: "xoxb-secret",
  tokenType: "bot",
  scopes: ["chat:write"],
  accountId: "T123",
  accountLabel: "Example workspace"
};

describe("live provider connectors", () => {
  it("builds provider authorization URLs with signed state and requested scopes", () => {
    const url = new URL(
      providerAuthorizationUrl({
        provider: "slack",
        application,
        state: "signed-state",
        scopes: ["team:read", "chat:write"]
      })
    );
    expect(url.origin).toBe("https://slack.com");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toBe("team:read,chat:write");
  });

  it("exchanges a Slack OAuth code without exposing the client secret in the URL", async () => {
    const fetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      expect(requestUrl(_url)).toBe("https://slack.com/api/oauth.v2.access");
      expect(requestUrl(_url)).not.toContain("client-secret");
      expect(requestBody(init?.body)).toContain("client_secret=local-only-client-secret");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            access_token: "xoxb-token",
            scope: "team:read,chat:write",
            token_type: "bot",
            team: { id: "T123", name: "Example workspace" }
          }),
          { status: 200 }
        )
      );
    });
    await expect(
      exchangeProviderCode("slack", application, "code", fetcher)
    ).resolves.toMatchObject({
      provider: "slack",
      accessToken: "xoxb-token",
      accountId: "T123"
    });
  });

  it("refreshes expiring HubSpot credentials", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "local-only-fresh-token",
            refresh_token: "local-only-next-refresh",
            expires_in: 1800
          }),
          { status: 200 }
        )
      )
    );
    const refreshed = await refreshProviderCredential(
      {
        provider: "hubspot",
        accessToken: "local-only-expired-token",
        refreshToken: "local-only-refresh-token",
        expiresAt: new Date(0).toISOString(),
        tokenType: "bearer",
        scopes: ["crm.objects.contacts.read"],
        accountId: "123",
        accountLabel: "HubSpot 123"
      },
      application,
      fetcher
    );
    expect(refreshed).toMatchObject({
      accessToken: "local-only-fresh-token",
      refreshToken: "local-only-next-refresh"
    });
  });

  it("tests Slack identity and executes a message action", async () => {
    const identityFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, team_id: "T123", team: "Example workspace", user_id: "U1" }),
          { status: 200 }
        )
      )
    );
    await expect(testProviderCredential(slackCredential, identityFetch)).resolves.toMatchObject({
      accountId: "T123",
      accountLabel: "Example workspace"
    });

    const actionFetch = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      expect(requestUrl(_url)).toBe("https://slack.com/api/chat.postMessage");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer xoxb-secret");
      expect(JSON.parse(requestBody(init?.body))).toEqual({
        channel: "C123",
        text: "Incident resolved"
      });
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, ts: "1.23" }), { status: 200 })
      );
    });
    await expect(
      executeProviderAction(
        slackCredential,
        {
          provider: "slack",
          action: "message.post",
          payload: { channel: "C123", text: "Incident resolved" }
        },
        "run:node",
        actionFetch
      )
    ).resolves.toMatchObject({ status: 200, body: { ok: true, ts: "1.23" } });
  });

  it("paginates Slack channel inventory for synchronization", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: "C1", name: "operations", updated: 10 }],
            response_metadata: { next_cursor: "next" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: "C2", name: "incidents", updated: 20 }],
            response_metadata: { next_cursor: "" }
          }),
          { status: 200 }
        )
      );
    await expect(fetchProviderObjects(slackCredential, fetcher)).resolves.toEqual([
      {
        objectType: "channel",
        externalId: "C1",
        externalVersion: "10",
        label: "operations",
        payloadReference: "slack://channel/C1"
      },
      {
        objectType: "channel",
        externalId: "C2",
        externalVersion: "20",
        label: "incidents",
        payloadReference: "slack://channel/C2"
      }
    ]);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("cursor=next");
  });

  it("executes HubSpot contact updates and default associations", async () => {
    const credential: ProviderCredential = {
      provider: "hubspot",
      accessToken: "local-only-hubspot-secret",
      refreshToken: "local-only-refresh-value",
      tokenType: "bearer",
      scopes: ["crm.objects.contacts.write"],
      accountId: "123",
      accountLabel: "HubSpot 123"
    };
    const fetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "456", method: init?.method }), { status: 200 })
      )
    );
    await executeProviderAction(
      credential,
      {
        provider: "hubspot",
        action: "object.update",
        payload: {
          objectType: "contacts",
          recordId: "456",
          properties: { lifecyclestage: "customer" }
        }
      },
      "run:update",
      fetcher
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.hubapi.com/crm/objects/2026-03/contacts/456"
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("PATCH");

    await executeProviderAction(
      credential,
      {
        provider: "hubspot",
        action: "association.create",
        payload: {
          fromObjectType: "contacts",
          fromRecordId: "456",
          toObjectType: "companies",
          toRecordId: "789"
        }
      },
      "run:associate",
      fetcher
    );
    expect(fetcher.mock.calls[1]?.[0]).toContain(
      "/crm/v4/objects/contacts/456/associations/default/companies/789"
    );
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PUT");
  });

  it("surfaces provider errors without including tokens", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 })
      )
    );
    await expect(
      executeProviderAction(
        slackCredential,
        {
          provider: "slack",
          action: "message.post",
          payload: { channel: "missing", text: "hello" }
        },
        "run:error",
        fetcher
      )
    ).rejects.toThrow("SLACK_channel_not_found");
  });
});
