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
        const expectedConcurrencyResponse =
          message.type() === "error" &&
          /Failed to load resource: the server responded with a status of (?:409|412)/u.test(
            message.text()
          );
        if (message.type() === "error" && !expectedConcurrencyResponse)
          messages.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

      await page.route("http://localhost:4100/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const method = route.request().method();
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
            permissions: ["*"],
            role: "owner",
            serverTime: "2026-07-31T00:00:00.000Z"
          };
        } else if (pathname === "/v1/workspaces") {
          body = {
            data: [
              {
                id: "10000000-0000-4000-8000-000000000001",
                slug: "northstar-studio",
                name: "Northstar Studio",
                state: "active",
                timezone: "UTC",
                locale: "en",
                region: "local",
                role: "owner",
                isSandbox: false
              },
              {
                id: "10000000-0000-4000-8000-000000000002",
                slug: "sample-lab",
                name: "Sample Lab",
                state: "active",
                timezone: "UTC",
                locale: "en",
                region: "local",
                role: "admin",
                isSandbox: true,
                sandboxLabel: "Sandbox — sample data"
              }
            ]
          };
        } else if (pathname.endsWith("/members")) {
          body = {
            data: [
              {
                id: "40000000-0000-4000-8000-000000000001",
                userId: "20000000-0000-4000-8000-000000000001",
                email: "ava@northstar.example",
                displayName: "Ava North",
                role: "owner",
                state: "active",
                createdAt: "2026-07-31T00:00:00.000Z"
              },
              {
                id: "40000000-0000-4000-8000-000000000002",
                userId: "20000000-0000-4000-8000-000000000002",
                email: "sam@northstar.example",
                displayName: "Sam Rivers",
                role: "builder",
                state: "active",
                createdAt: "2026-07-31T00:00:00.000Z"
              }
            ]
          };
        } else if (pathname.endsWith("/invitations")) {
          body = { data: [] };
        } else if (pathname.endsWith("/roles")) {
          body = {
            data: [
              {
                id: "50000000-0000-4000-8000-000000000001",
                key: "owner",
                name: "Owner",
                description: "Built-in owner role",
                permissions: ["*"],
                system: true
              }
            ]
          };
        } else if (pathname.endsWith("/groups")) {
          body = { data: [] };
        } else if (pathname === "/v1/me/onboarding") {
          body = {
            data: {
              workspaceId: "10000000-0000-4000-8000-000000000001",
              userId: "20000000-0000-4000-8000-000000000001",
              currentStep: "role_use_case",
              completedSteps: [],
              skippedSteps: [],
              profile: {},
              revision: 1
            }
          };
        } else if (pathname === "/v1/me/onboarding/sample-workspaces") {
          body = { id: "60000000-0000-4000-8000-000000000001", label: "SAMPLE DATA" };
        } else if (pathname === "/edge/v1/invitation-responses/preview") {
          body = {
            data: {
              id: "70000000-0000-4000-8000-000000000001",
              workspaceId: "10000000-0000-4000-8000-000000000001",
              workspaceName: "Northstar Studio",
              email: "ava@northstar.example",
              role: "builder",
              state: "pending",
              expiresAt: "2026-08-01T00:00:00.000Z",
              createdAt: "2026-07-31T00:00:00.000Z"
            }
          };
        } else if (pathname === "/edge/v1/invitation-responses") {
          body = { result: "accepted" };
        } else if (pathname.endsWith("/workflows") && pathname.includes("/workspaces/")) {
          body = method === "GET" ? { data: demoWorkflows } : { data: demoWorkflow };
        } else if (pathname.endsWith("/draft")) {
          body = {
            data: {
              workflowId: demoWorkflow.id,
              version: 8,
              revision: 3,
              etag: '"wf-8-3-browser"',
              contentHash: `sha256:${"a".repeat(64)}`,
              definition: {
                schemaVersion: 1,
                name: demoWorkflow.name,
                description: demoWorkflow.description,
                inputSchema: {},
                outputSchema: {},
                nodes: [
                  {
                    key: "start",
                    kind: "trigger",
                    name: "Capture signal",
                    description: "",
                    position: { x: 0, y: 0 },
                    configuration: {}
                  },
                  {
                    key: "review",
                    kind: "approval",
                    name: "Editorial gate",
                    description: "",
                    position: { x: 240, y: 0 },
                    configuration: { policy: "workspace_owner" }
                  }
                ],
                edges: [{ key: "start_review", source: "start", target: "review" }]
              }
            }
          };
        } else if (pathname.endsWith("/draft/validations")) {
          body = { data: { valid: true, findings: [] } };
        } else if (pathname.endsWith("/draft/publications")) {
          body = {
            data: {
              published: true,
              findings: [],
              publishedVersion: 8,
              nextDraftVersion: 9,
              contentHash: `sha256:${"a".repeat(64)}`
            }
          };
        } else if (pathname.endsWith("/versions")) {
          body = {
            data: [
              {
                version: 9,
                state: "draft",
                revision: 1,
                contentHash: `sha256:${"a".repeat(64)}`,
                releaseNote: "",
                createdAt: "2026-07-31T12:00:00.000Z"
              },
              {
                version: 8,
                state: "published",
                revision: 3,
                contentHash: `sha256:${"b".repeat(64)}`,
                releaseNote: "Ready for launch",
                publishedAt: "2026-07-31T11:00:00.000Z",
                createdAt: "2026-07-31T10:00:00.000Z"
              }
            ]
          };
        } else if (/\/versions\/\d+$/u.test(pathname)) {
          body = {
            data: {
              workflowId: demoWorkflow.id,
              version: Number(pathname.split("/").at(-1)),
              revision: 3,
              etag: '"published"',
              contentHash: `sha256:${"b".repeat(64)}`,
              definition: {
                schemaVersion: 1,
                name: demoWorkflow.name,
                description: demoWorkflow.description,
                inputSchema: {},
                outputSchema: {},
                nodes: [],
                edges: []
              }
            }
          };
        } else if (pathname.endsWith("/version-diffs")) {
          body = { data: { from: 8, to: 9, addedNodes: ["review"], removedNodes: [] } };
        } else if (pathname.endsWith("/drafts-from-version")) {
          body = { data: { version: 10 } };
        } else if (pathname === "/v1/templates") {
          body = {
            data: [
              {
                id: "80000000-0000-4000-8000-000000000001",
                name: "Launch review",
                description: "Reusable launch governance",
                state: "draft",
                version: 1,
                definition: {
                  schemaVersion: 1,
                  name: "Launch review",
                  description: "",
                  inputSchema: {},
                  outputSchema: {},
                  nodes: [],
                  edges: []
                },
                variables: []
              }
            ]
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
          const data = pathname.endsWith("/workflows") ? demoWorkflows : demoWorkflow;
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
