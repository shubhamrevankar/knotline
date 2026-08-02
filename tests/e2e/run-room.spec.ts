import { expect, test } from "./fixtures.js";

test("operator reviews published inputs before launching a durable run", async ({ page }) => {
  await page.goto("/app/workflows");
  await page.getByRole("button", { name: "Run workflow" }).click();
  const dialog = page.getByRole("dialog", { name: /Run Launch intelligence brief/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Published version 8")).toBeVisible();
  await expect(dialog.getByLabel("Case ID Required")).toHaveValue(/CASE-/u);
  await dialog.getByLabel("Incident summary Required").fill("Critical customer recovery test");
  await dialog.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/app\/runs\/ca67b16d/u);
  await expect(page.getByRole("region", { name: "Current run status" })).toBeVisible();
});

test("@a11y operator filters runs and diagnoses live work across equivalent views", async ({
  page
}) => {
  await page.goto("/app/runs");
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  await page.getByLabel("Status").selectOption("running");
  await expect(page).toHaveURL(/status=running/u);
  await page.getByRole("link", { name: /Launch intelligence brief/u }).click();
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("region", { name: "Run execution" })).toBeVisible();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByText("run queued")).toBeVisible();
});

test("run room exposes safe controls and a redacted attempt inspector on mobile", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/runs/ca67b16d-049d-4019-b538-1f00c23be76b");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog", { name: "Pause this run?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm pause" }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /research brief/u }).click();
  await expect(page.getByRole("heading", { name: "research brief" })).toBeVisible();
  await expect(page.getByText(/Lead with bounded agent authority/u)).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
