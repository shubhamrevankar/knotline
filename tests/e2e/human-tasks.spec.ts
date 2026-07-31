import { expect, test } from "./fixtures.js";

test("@a11y member filters, claims, drafts, and completes a human task", async ({ page }) => {
  await page.goto("/app/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.getByRole("button", { name: "Unassigned" }).click();
  await expect(page.getByRole("link", { name: /Confirm security evidence/u })).toBeVisible();
  await page.goto("/app/tasks/task-284");
  await expect(page.getByRole("heading", { name: "Review renewal exception" })).toBeVisible();
  await page.getByLabel("Recommendation").selectOption("Approve exception");
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.getByRole("button", { name: "Submit decision" }).click();
  await expect(page.getByRole("heading", { name: "Task submitted" })).toBeVisible();
});

test("human task form remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/tasks/task-284");
  await expect(page.getByLabel("Customer impact")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
