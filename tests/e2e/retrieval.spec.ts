import { expect, test } from "./fixtures.js";

const documentId = "a2000000-0000-4000-8000-000000000001";
const sourceId = "a2000000-0000-4000-8000-000000000002";
const chunkId = "a2000000-0000-4000-8000-000000000003";
const manifestId = "a2000000-0000-4000-8000-000000000004";

test("@a11y searches only authorized knowledge and opens an exact citation", async ({ page }) => {
  await page.route("**/v1/workspaces/*/authorization-proofs", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          proof: ["signed", "authorization", "proof"].join("."),
          expiresAt: "2026-08-01T00:05:00.000Z"
        }
      })
    })
  );
  await page.route("**/v1/workspaces/*/retrieval-debug", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          manifestId,
          corpusGeneration: "a2000000-0000-4000-8000-000000000005",
          normalizedQueryHash: `sha256:${"a".repeat(64)}`,
          results: [
            {
              sourceObjectId: sourceId,
              documentId,
              documentVersion: 3,
              chunkId,
              title: "Incident response handbook",
              snippet: "Declare an incident commander before paging the responder group.",
              coordinate: { kind: "page", index: 4 },
              score: 0.812,
              scoreBreakdown: { keyword: 0.42, semantic: 0.392 },
              contentHash: `sha256:${"b".repeat(64)}`,
              permissionEvidenceHash: `sha256:${"c".repeat(64)}`,
              classification: "internal",
              freshness: "2026-08-01T00:00:00.000Z",
              previewUrl: `/v1/documents/${documentId}/citations?chunkId=${chunkId}`
            }
          ],
          exclusions: { authorization: 2, contextBudget: 0 },
          latencyMs: 42,
          debug: { candidates: 3, injectionSignalsAreUntrusted: true }
        }
      })
    })
  );
  await page.route(`**/v1/documents/${documentId}/citations**`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          document_id: documentId,
          document_version: 3,
          coordinate: { kind: "page", index: 4 },
          text_content: "Declare an incident commander before paging the responder group."
        }
      })
    })
  );
  await page.goto("/app/knowledge/search");
  await page.getByLabel("What are you looking for?").fill("incident commander");
  await page.getByRole("button", { name: "Search knowledge" }).click();
  await expect(page.getByRole("heading", { name: "Incident response handbook" })).toBeVisible();
  await expect(page.getByText("page 5 · document version 3")).toBeVisible();
  await expect(page.getByText("Authorized now")).toBeVisible();
  await page.getByRole("button", { name: "Open exact citation" }).click();
  await expect(page.getByRole("heading", { name: "Exact authorized citation" })).toBeVisible();
});

test("revoked search fails closed without leaking prior result metadata on mobile", async ({
  page
}) => {
  await page.route("**/v1/workspaces/*/authorization-proofs", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          proof: ["new", "restricted", "proof"].join("."),
          expiresAt: "2026-08-01T00:05:00.000Z"
        }
      })
    })
  );
  await page.route("**/v1/workspaces/*/retrieval-debug", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          manifestId,
          corpusGeneration: "a2000000-0000-4000-8000-000000000005",
          normalizedQueryHash: `sha256:${"d".repeat(64)}`,
          results: [],
          exclusions: { authorization: 3, contextBudget: 0 },
          latencyMs: 9
        }
      })
    })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/knowledge/search");
  await page.getByLabel("What are you looking for?").fill("restricted title");
  await page.getByRole("button", { name: "Search knowledge" }).click();
  await expect(page.getByText("No permitted results")).toBeVisible();
  await expect(page.getByText("Incident response handbook")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
