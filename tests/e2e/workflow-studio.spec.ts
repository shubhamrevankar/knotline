import { expect, test } from "./fixtures.js";

const workflowId = "wf_launch-campaign";

test("@a11y keyboard and pointer users can construct and edit a workflow", async ({ page }) => {
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Workflow canvas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accessible outline" })).toBeVisible();

  await page.getByPlaceholder("Search step kinds").fill("integration");
  await page.getByRole("button", { name: "integration action" }).click();
  await expect(
    page.getByRole("button", { name: "integration action 3", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Capture signal", exact: true }).click();
  await page.getByLabel("Name").fill("Receive signal");
  await expect(page.getByRole("button", { name: "Receive signal", exact: true })).toBeVisible();

  await page.getByRole("heading", { name: "Launch intelligence brief" }).click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.getByRole("button", { name: "Receive signal copy", exact: true })
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "Receive signal copy", exact: true })).toHaveCount(
    0
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(
    page.getByRole("button", { name: "Receive signal copy", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Change layout" }).click();
  await page.getByRole("button", { name: "Keyboard help" }).click();
  await expect(page.getByRole("dialog", { name: "Workflow studio shortcuts" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("status")).toContainText("Draft needs attention");
});

test("mobile uses a complete outline-first editing alternative", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/workflows/${workflowId}/studio`);
  const outline = page.getByRole("heading", { name: "Accessible outline" });
  await expect(outline).toBeVisible();
  await expect(page.getByRole("region", { name: "Workflow canvas" })).toBeVisible();
  await page.getByRole("button", { name: "Editorial gate", exact: true }).click();
  await expect(page.getByLabel("Approval policy")).toBeVisible();
  await page.getByLabel("Approval policy").fill("security_owner");
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("optimistic concurrency never silently overwrites another editor", async ({ page }) => {
  await page.route(`http://localhost:4100/v1/workflows/${workflowId}/draft`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 412,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "DRAFT_CONFLICT", message: "Draft changed" } })
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await page.getByRole("button", { name: "Capture signal", exact: true }).click();
  await page.getByLabel("Name").fill("Conflicting edit");
  await expect(page.getByRole("status")).toContainText("Another editor changed this draft", {
    timeout: 4_000
  });
  await expect(page.getByRole("button", { name: "Reload server draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Encrypted recovery available" })).toBeVisible();
});
