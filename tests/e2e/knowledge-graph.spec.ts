import { expect, test } from "./fixtures.js";

const entityId = "a2100000-0000-4000-8000-000000000001";
const relatedId = "a2100000-0000-4000-8000-000000000002";
const profile = {
  id: entityId,
  type: "project",
  typeVersion: 1,
  canonicalName: "Launch readiness",
  revision: 3,
  updatedAt: "2026-08-01T00:00:00.000Z",
  aliases: [{ id: "a2100000-0000-4000-8000-000000000010", alias: "GA readiness" }],
  facts: [
    {
      id: "a2100000-0000-4000-8000-000000000011",
      key: "status",
      value: "at risk",
      kind: "provider",
      confidence: 0.94,
      evidence: [
        {
          documentId: "a2100000-0000-4000-8000-000000000020",
          chunkId: "a2100000-0000-4000-8000-000000000021",
          coordinate: { kind: "page", index: 6 },
          contentHash: `sha256:${"a".repeat(64)}`,
          aclEpoch: 4
        }
      ]
    }
  ],
  conflicts: [
    {
      id: "a2100000-0000-4000-8000-000000000030",
      attributeKey: "target_date",
      factIds: ["one", "two"],
      state: "open"
    }
  ],
  history: [{ revision: 3, action: "updated", occurredAt: "2026-08-01T00:00:00.000Z" }]
};

test("@a11y entity profile preserves provenance, conflict, and equivalent graph outline", async ({
  page
}) => {
  await page.route(`**/v1/entities/${entityId}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: profile }) })
  );
  await page.route("**/v1/workspaces/*/authorization-proofs", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: { proof: "signed.graph.proof", expiresAt: "2026-08-01T00:05:00.000Z" }
      })
    })
  );
  await page.route(`**/v1/entities/${entityId}/relations**`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [
            {
              id: relatedId,
              type: "decision",
              canonicalName: "Approve launch",
              revision: 1,
              updatedAt: "2026-08-01T00:00:00.000Z"
            }
          ],
          truncated: false,
          elapsedMs: 4
        }
      })
    })
  );
  await page.route(`**/v1/entities/${entityId}/exports`, (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: { id: "a2100000-0000-4000-8000-000000000040", version: 1, entity: profile }
      })
    })
  );
  await page.goto(`/app/knowledge/entities/${entityId}`);
  await expect(page.getByRole("heading", { name: "Launch readiness" })).toBeVisible();
  await expect(page.getByText("at risk")).toBeVisible();
  await expect(
    page.getByText("Competing values remain visible until an authorized reviewer resolves them.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore relations" }).click();
  await expect(page.getByRole("treeitem", { name: "Approve launch · decision" })).toBeVisible();
  await page.getByRole("button", { name: "Export provenance" }).click();
  await expect(page.getByRole("heading", { name: "Authorized provenance packet" })).toBeVisible();
});

test("knowledge administration degrades safely on a phone", async ({ page }) => {
  await page.route("**/v1/workspaces/*/knowledge-admin", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          sources: [
            {
              id: "a2100000-0000-4000-8000-000000000050",
              title: "Launch decision log",
              state: "ready",
              aclEpoch: 8
            }
          ],
          conflicts: profile.conflicts
        }
      })
    })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/knowledge");
  await expect(
    page.getByRole("heading", { name: "Knowledge health and provenance" })
  ).toBeVisible();
  await expect(page.getByText("Launch decision log")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
