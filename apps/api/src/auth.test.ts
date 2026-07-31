import { generateKeyPairSync, sign } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthFailure,
  assertRecentAuthentication,
  normalizeEmail,
  parseCookies,
  RemoteGoogleOidcClient,
  secretHash
} from "./auth.js";

const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function signedToken(payload: Record<string, unknown>, corrupt = false) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const header = encoded({ alg: "RS256", kid: "fixture-key", typ: "JWT" });
  const body = encoded(payload);
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString(
    "base64url"
  );
  const token = `${header}.${body}.${corrupt ? `${signature.slice(0, -2)}xx` : signature}`;
  return {
    token,
    jwk: { ...publicKey.export({ format: "jwk" }), kid: "fixture-key", alg: "RS256", use: "sig" }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("authentication primitives", () => {
  it("normalizes identities and parses cookies without throwing on malformed input", () => {
    expect(normalizeEmail("  Maya@Northstar.Example ")).toBe("maya@northstar.example");
    expect(() => normalizeEmail("not-an-email")).toThrow(AuthFailure);
    expect(parseCookies("first=one; invalid; encoded=hello%20world")).toEqual({
      first: "one",
      encoded: "hello world"
    });
    expect(secretHash("credential")).toMatch(/^sha256:[a-f0-9]{64}$/u);
    const identity = {
      sessionId: crypto.randomUUID(),
      familyId: crypto.randomUUID(),
      user: {
        id: crypto.randomUUID(),
        email: "maya@northstar.example",
        displayName: "Maya",
        status: "active" as const,
        locale: "en",
        timezone: "UTC"
      },
      issuedAt: new Date(0).toISOString(),
      lastUsedAt: new Date(0).toISOString(),
      idleExpiresAt: new Date(60_000).toISOString(),
      absoluteExpiresAt: new Date(60_000).toISOString(),
      lastStepUpAt: new Date(10_000).toISOString(),
      deviceSummary: "Test"
    };
    expect(() => assertRecentAuthentication(identity, 5_000, new Date(14_000))).not.toThrow();
    expect(() => assertRecentAuthentication(identity, 5_000, new Date(16_000))).toThrow(
      AuthFailure
    );
  });

  it("verifies a signed Google ID token with the exact public key", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fixture = signedToken({
      iss: "https://accounts.google.com",
      sub: "google-user-1",
      aud: "client-1",
      nonce: "nonce-1",
      exp: now + 300,
      iat: now,
      email: "maya@northstar.example",
      email_verified: true
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fixture.token }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ keys: [fixture.jwk] }), {
            status: 200,
            headers: { "cache-control": "public,max-age=300", "content-type": "application/json" }
          })
        )
    );
    const client = new RemoteGoogleOidcClient(
      "https://accounts.google.com",
      "client-1",
      "https://oauth.example/token",
      "https://oauth.example/keys"
    );
    await expect(
      client.exchange({
        code: "code",
        redirectUri: "https://app.example/callback",
        pkceVerifier: "verifier"
      })
    ).resolves.toMatchObject({ subject: "google-user-1", emailVerified: true });
  });

  it("rejects an ID token whose RSA signature was altered", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fixture = signedToken(
      {
        iss: "https://accounts.google.com",
        sub: "google-user-1",
        aud: "client-1",
        nonce: "nonce-1",
        exp: now + 300,
        iat: now,
        email: "maya@northstar.example",
        email_verified: true
      },
      true
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id_token: fixture.token }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ keys: [fixture.jwk] }), { status: 200 })
        )
    );
    const client = new RemoteGoogleOidcClient(
      "https://accounts.google.com",
      "client-1",
      "https://oauth.example/token",
      "https://oauth.example/keys"
    );
    await expect(
      client.exchange({
        code: "code",
        redirectUri: "https://app.example/callback",
        pkceVerifier: "verifier"
      })
    ).rejects.toMatchObject({ code: "OIDC_SIGNATURE_INVALID" });
  });
});
