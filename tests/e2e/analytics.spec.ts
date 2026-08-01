import { expect, test } from "./fixtures.js";
const workspaceId = "10000000-0000-4000-8000-000000000001";
test("@a11y authorized search saves a reproducible view on mobile", async ({ page }) => {
  let saved = false;
  await page.route(`**/v1/workspaces/${workspaceId}/saved-views`, async (route) => {
    if (route.request().method() === "POST") {
      saved = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "a2800000-0000-4000-8000-000000000001",
            name: "incident results",
            resourceType: "run",
            visibility: "private",
            definition: {},
            schemaVersion: 1,
            isDefault: false,
            revision: 1
          }
        })
      });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  await page.route(`**/v1/workspaces/${workspaceId}/search?q=*`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "d1",
            resourceType: "run",
            resourceId: "a2800000-0000-4000-8000-000000000002",
            fields: { title: "Incident response", summary: "Authorized run" },
            updatedAt: "2026-08-01T10:00:00Z"
          }
        ]
      })
    })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/search");
  await page.getByLabel("Search workspace").fill("incident");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Incident response")).toBeVisible();
  await page.getByRole("button", { name: "Save this view" }).click();
  await expect(page.getByText("incident results")).toBeVisible();
  expect(saved).toBe(true);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
test("analytics labels partial data and queues a safe export", async ({ page }) => {
  await page.route(`**/v1/workspaces/${workspaceId}/analytics`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: { metrics: [], freshThrough: null, partial: true, demoExcluded: true }
      })
    })
  );
  await page.route(`**/v1/workspaces/${workspaceId}/reports`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "a2800000-0000-4000-8000-000000000003",
            name: "Operations health",
            definition: { metrics: ["workflow.success_rate"], range: "30d" },
            visibility: "workspace",
            state: "active",
            revision: 1
          }
        ]
      })
    })
  );
  await page.route("**/v1/reports/a2800000-0000-4000-8000-000000000003", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "a2800000-0000-4000-8000-000000000003",
          name: "Operations health",
          definition: { metrics: ["workflow.success_rate"], range: "30d" },
          visibility: "workspace",
          state: "active",
          revision: 1
        }
      })
    })
  );
  await page.route("**/v1/reports/a2800000-0000-4000-8000-000000000003/exports", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "export-1", state: "queued" } })
    })
  );
  await page.goto("/app/analytics");
  await expect(page.getByText("Partial data")).toBeVisible();
  await expect(
    page.getByText("Demo workspaces and sample activity are excluded by default.")
  ).toBeVisible();
  await page.getByRole("link", { name: "Open report" }).click();
  await page.getByRole("button", { name: "Export safe CSV" }).click();
  await expect(page.getByText(/Export queued/)).toBeVisible();
});
