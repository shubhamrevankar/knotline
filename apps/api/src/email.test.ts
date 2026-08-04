import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendAuthMailer } from "./auth.js";
import { ResendInvitationMailer } from "./workspace.js";

afterEach(() => vi.unstubAllGlobals());

describe("Resend email adapters", () => {
  it("delivers magic links with a stable idempotency key", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer re_test",
        "content-type": "application/json"
      });
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toMatch(/^magic-/u);
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload).toMatchObject({
        from: "Knotline <hello@example.com>",
        to: ["person@example.com"],
        subject: "Sign in to Knotline"
      });
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await new ResendAuthMailer(
      "re_test",
      "Knotline <hello@example.com>"
    ).deliverMagicLink({
      email: "person@example.com",
      callbackUrl: "https://demo.example.com/auth/magic/callback#token=secret",
      expiresAt: "2026-08-05T10:00:00.000Z"
    });
    expect(result.providerMessageId).toBe("email_123");
  });

  it("delivers invitations without an SDK or local mail capture", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toMatch(/^invite-/u);
      return new Response(JSON.stringify({ id: "email_456" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new ResendInvitationMailer("re_test", "Knotline <hello@example.com>").deliverInvitation({
        email: "teammate@example.com",
        workspaceName: "Acme Operations",
        acceptanceUrl: "https://demo.example.com/invitations/accept#token=secret",
        expiresAt: "2026-08-12T10:00:00.000Z"
      })
    ).resolves.toBeUndefined();
  });
});
