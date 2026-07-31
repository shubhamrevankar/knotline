import { expect, test as base } from "@playwright/test";
import { demoWorkflow, demoWorkflows } from "../../apps/web/src/demo.js";

export const test = base.extend<{ consoleMessages: string[] }>({
  consoleMessages: [
    async ({ page }, use) => {
      const messages: string[] = [];

      await page.addInitScript(() => {
        if (new URL(globalThis.location.href).searchParams.has("consent")) {
          globalThis.localStorage.removeItem("knotline.consent.v1");
        } else {
          globalThis.localStorage.setItem("knotline.consent.v1", "essential");
        }
      });

      page.on("console", (message) => {
        if (message.type() === "error") messages.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

      await page.route("http://localhost:4100/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let body: unknown;
        if (pathname === "/v1/me/bootstrap") {
          body = {
            user: {
              id: "20000000-0000-4000-8000-000000000001",
              email: "ava@northstar.example",
              displayName: "Ava North",
              status: "active",
              locale: "en",
              timezone: "UTC"
            },
            workspaces: [
              {
                id: "10000000-0000-4000-8000-000000000001",
                name: "Northstar Studio",
                slug: "northstar-studio",
                role: "owner"
              }
            ],
            activeWorkspaceId: "10000000-0000-4000-8000-000000000001",
            serverTime: "2026-07-31T00:00:00.000Z"
          };
        } else if (pathname === "/v1/me") {
          body = {
            data: {
              id: "20000000-0000-4000-8000-000000000001",
              email: "ava@northstar.example",
              displayName: "Ava North",
              status: "active",
              locale: "en",
              timezone: "UTC"
            }
          };
        } else if (pathname === "/edge/v1/auth/magic-links") {
          body = { accepted: true };
        } else if (
          pathname === "/edge/v1/auth/magic-links/exchange" ||
          pathname === "/edge/v1/auth/google/exchange"
        ) {
          body = { returnTarget: "/app/workflows" };
        } else if (pathname === "/edge/v1/auth/google/authorizations") {
          body = {
            authorizationUrl: "http://localhost:4100/__local/oidc/authorize",
            expiresAt: "2026-07-31T00:10:00.000Z"
          };
        } else if (pathname === "/__local/oidc/authorize") {
          await route.fulfill({
            status: 303,
            headers: {
              location:
                "http://127.0.0.1:4173/auth/google/callback#result=local-browser-result-handle"
            }
          });
          return;
        } else if (pathname === "/v1/auth/sessions") {
          body = {
            data: [
              {
                id: "30000000-0000-4000-8000-000000000001",
                current: true,
                deviceSummary: "Chromium on local test device",
                issuedAt: "2026-07-31T00:00:00.000Z",
                lastUsedAt: "2026-07-31T00:05:00.000Z",
                idleExpiresAt: "2026-07-31T12:05:00.000Z",
                absoluteExpiresAt: "2026-08-30T00:00:00.000Z"
              }
            ]
          };
        } else {
          const data = pathname.includes("/teams/") ? demoWorkflows : demoWorkflow;
          body = { data };
        }
        await route.fulfill({
          body: JSON.stringify(body),
          headers: {
            "access-control-allow-credentials": "true",
            "access-control-allow-origin": "http://127.0.0.1:4173",
            "content-type": "application/json"
          },
          status: 200
        });
      });

      await use(messages);
      expect(messages, "browser console and page errors").toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
