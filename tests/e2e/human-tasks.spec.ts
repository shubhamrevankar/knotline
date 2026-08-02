import { expect, test } from "./fixtures.js";

test("@a11y member finds and completes a durable human task", async ({ page }) => {
  await page.goto("/app/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: /publish brief/u })).toBeVisible();
  await page.goto("/app/tasks/bf608083-2663-4759-a162-37ce5457220d");
  await expect(page.getByRole("heading", { name: "publish brief" })).toBeVisible();
  await page.getByLabel("Publication note").fill("Approved launch brief published.");
  await page.getByRole("button", { name: "Submit and complete run" }).click();
  await expect(page.getByRole("heading", { name: "Task submitted" })).toBeVisible();
});

test("human task form remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/tasks/bf608083-2663-4759-a162-37ce5457220d");
  await expect(page.getByLabel("Publication note")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
