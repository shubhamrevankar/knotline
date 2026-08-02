import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";

const searchResponse = {
  data: [
    {
      id: "search-workflow",
      resourceType: "workflow",
      resourceId: "wf_launch-campaign",
      fields: {
        title: "Launch intelligence brief",
        summary: "Turn a product signal into a reviewed launch brief."
      },
      updatedAt: "2026-08-02T10:00:00Z"
    },
    {
      id: "search-run",
      resourceType: "run",
      resourceId: "3c2fd8ca-a77c-41ce-b333-40152b3c8643",
      fields: {
        title: "Enterprise customer recovery orchestration",
        summary: "A live recovery run awaiting governed review."
      },
      updatedAt: "2026-08-02T09:00:00Z"
    }
  ]
};

test("global search stays in context, supports the keyboard, and opens an exact result", async ({
  page
}) => {
  await page.route(`**/v1/workspaces/${workspaceId}/search?q=*`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(searchResponse) })
  );
  await page.goto("/app/workflows");

  const trigger = page.getByRole("button", { name: "Open workspace search" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Quick access" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL("/app/workflows");
  await expect(dialog.getByText("Only content you can access is shown")).toBeVisible();

  const input = page.getByRole("searchbox", { name: "Search across workspace" });
  await input.fill("launch");
  await expect(page.getByRole("option", { name: /Launch intelligence brief/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Enterprise customer recovery/ })).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .include(".workspace-search-dialog")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await input.press("Enter");
  await expect(page).toHaveURL("/app/workflows/wf_launch-campaign");

  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("deep search is optional and provides complete type filters", async ({ page }) => {
  await page.route(`**/v1/workspaces/${workspaceId}/search?q=*`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(searchResponse) })
  );
  await page.goto("/app/runs");
  await page.getByRole("button", { name: "Open workspace search" }).click();
  await page.getByRole("searchbox", { name: "Search across workspace" }).fill("launch");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("button", { name: /See all results for/ }).click();

  await expect(page).toHaveURL("/app/search?q=launch");
  await expect(page.getByText("2 matches for “launch”")).toBeVisible();
  await expect(page.getByRole("button", { name: "All 2" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Run 1" }).click();
  await expect(page.getByText("Enterprise customer recovery orchestration")).toBeVisible();
  await expect(page.getByText("Launch intelligence brief")).toHaveCount(0);
});

test("workspace search remains usable on a narrow mobile surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/workflows");
  await page.getByRole("button", { name: "Open workspace search" }).click();
  await expect(page.getByRole("dialog", { name: "Quick access" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Workflows/ })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
