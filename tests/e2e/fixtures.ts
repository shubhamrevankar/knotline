import { expect, test as base } from "@playwright/test";
import { demoWorkflow, demoWorkflows } from "../../apps/web/src/demo.js";

export const test = base.extend<{ consoleMessages: string[] }>({
  consoleMessages: [
    async ({ page }, use) => {
      const messages: string[] = [];
      const generatedDefinition = {
        schemaVersion: 1,
        name: "Launch request approval",
        description: "SIMULATED guided workflow",
        inputSchema: {},
        outputSchema: {},
        nodes: [
          {
            key: "request_received",
            kind: "trigger",
            name: "Request received",
            description: "",
            position: { x: 80, y: 120 },
            configuration: { triggerType: "manual" }
          },
          {
            key: "prepare_request",
            kind: "human",
            name: "Prepare request",
            description: "",
            position: { x: 360, y: 120 },
            configuration: { assignment: "workflow_initiator" }
          },
          {
            key: "review_request",
            kind: "approval",
            name: "Review request",
            description: "",
            position: { x: 640, y: 120 },
            configuration: { policy: "workspace_owner" }
          }
        ],
        edges: [
          { key: "path_1", source: "request_received", target: "prepare_request" },
          { key: "path_2", source: "prepare_request", target: "review_request" }
        ]
      };
      let collaborationFollowed = false;
      let collaborationComment:
        | {
            id: string;
            body: string;
            renderedHtml: string;
            state: "active" | "edited" | "deleted";
            reactions: { reaction: "thumbs_up"; count: number; reacted: boolean }[];
          }
        | undefined;

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
        } else if (pathname.includes("/resources/workflow/") && pathname.endsWith("/thread")) {
          body = {
            data: {
              id: "91000000-0000-4000-8000-000000000001",
              resourceType: "workflow",
              resourceId: demoWorkflow.id,
              followed: collaborationFollowed,
              sharePath: `/app/workflows/${demoWorkflow.id}`,
              presence: [
                {
                  id: "20000000-0000-4000-8000-000000000001",
                  displayName: "Ava North",
                  lastSeenAt: "2026-07-31T00:00:00.000Z"
                }
              ],
              comments: collaborationComment
                ? [
                    {
                      ...collaborationComment,
                      threadId: "91000000-0000-4000-8000-000000000001",
                      authorUserId: "20000000-0000-4000-8000-000000000001",
                      authorDisplayName: "Ava North",
                      attachmentRefs: ["artifact_review_12345678"],
                      mentionedUserIds: ["20000000-0000-4000-8000-000000000002"],
                      createdAt: "2026-07-31T00:00:00.000Z",
                      updatedAt: "2026-07-31T00:00:00.000Z",
                      editableUntil: "2026-07-31T00:15:00.000Z"
                    }
                  ]
                : [],
              activity: collaborationComment
                ? [
                    {
                      id: "91000000-0000-4000-8000-000000000003",
                      type: "comment.created",
                      actorUserId: "20000000-0000-4000-8000-000000000001",
                      summary: "Comment added",
                      createdAt: "2026-07-31T00:00:00.000Z"
                    }
                  ]
                : []
            }
          };
        } else if (pathname.includes("/resources/workflow/") && pathname.endsWith("/comments")) {
          collaborationComment = {
            id: "91000000-0000-4000-8000-000000000002",
            body: "**Review** <script>alert(1)</script>",
            renderedHtml: "<strong>Review</strong> &lt;script&gt;alert(1)&lt;/script&gt;",
            state: "active",
            reactions: []
          };
          body = { id: collaborationComment.id };
        } else if (/\/v1\/comments\/[^/]+$/u.test(pathname) && method === "PATCH") {
          if (collaborationComment) {
            collaborationComment.body = "Edited review note";
            collaborationComment.renderedHtml = "Edited review note";
            collaborationComment.state = "edited";
          }
          body = { updated: true };
        } else if (/\/v1\/comments\/[^/]+$/u.test(pathname) && method === "DELETE") {
          if (collaborationComment) {
            collaborationComment.body = "[deleted]";
            collaborationComment.renderedHtml = "[deleted]";
            collaborationComment.state = "deleted";
          }
          body = undefined;
        } else if (pathname.endsWith("/reactions") && method === "POST") {
          if (collaborationComment)
            collaborationComment.reactions = [{ reaction: "thumbs_up", count: 1, reacted: true }];
          body = undefined;
        } else if (pathname.endsWith("/follows")) {
          collaborationFollowed = method === "POST";
          body = undefined;
        } else if (pathname.endsWith("/workflow-generations") && method === "POST") {
          body = {
            data: {
              id: "90000000-0000-4000-8000-000000000001",
              sourcePrompt: "Collect a launch request and require owner approval.",
              lifecycle: "QUEUED"
            }
          };
        } else if (pathname === "/v1/workflow-generations/90000000-0000-4000-8000-000000000001") {
          body = {
            data: {
              id: "90000000-0000-4000-8000-000000000001",
              sourcePrompt: "Collect a launch request and require owner approval.",
              lifecycle: "SUCCEEDED",
              phase: "READY_TO_ACCEPT",
              result: {
                promptVersion: "workflow-generation.v1",
                provider: "fixture-v1",
                simulated: true,
                definition: generatedDefinition,
                assumptions: ["The workflow starts manually."],
                assignments: ["Prepare request → workflow initiator"],
                missingIntegrations: [],
                findings: [],
                repairAttempts: 0,
                usage: { inputUnits: 56, outputUnits: 900, costMinor: 0, currency: "USD" },
                diff: { addedNodes: 3, addedEdges: 2 }
              }
            }
          };
        } else if (pathname === "/v1/workflow-dry-runs") {
          body = {
            data: {
              simulated: true,
              externalWrites: 0,
              path: ["request_received", "prepare_request", "review_request"],
              steps: [
                {
                  nodeKey: "request_received",
                  kind: "trigger",
                  source: "input",
                  value: {},
                  externalWrite: false
                },
                {
                  nodeKey: "prepare_request",
                  kind: "human",
                  source: "human_fixture",
                  value: {},
                  externalWrite: false
                },
                {
                  nodeKey: "review_request",
                  kind: "approval",
                  source: "deterministic",
                  value: {},
                  externalWrite: false
                }
              ],
              findings: [],
              preflight: {
                allowed: true,
                expectedCostMinor: 0,
                currency: "USD",
                checks: [
                  { key: "permission", passed: true, message: "Workflow run permission" },
                  { key: "entitlement", passed: true, message: "Workflow entitlement" }
                ]
              }
            }
          };
        } else if (pathname.endsWith("/acceptances")) {
          body = {
            workflowId: "90000000-0000-4000-8000-000000000002",
            simulated: true,
            published: true
          };
        } else if (pathname === "/v1/workflow-import-previews") {
          body = {
            data: { definition: generatedDefinition, findings: [], createsResource: false }
          };
        } else if (pathname.endsWith("/workflow-imports")) {
          body = { id: "90000000-0000-4000-8000-000000000003" };
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
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            "access-control-allow-credentials": "true",
            "access-control-allow-origin": "http://127.0.0.1:4173",
            "content-type": "application/json"
          },
          status: body === undefined ? 204 : 200
        });
      });

      await use(messages);
      expect(messages, "browser console and page errors").toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
