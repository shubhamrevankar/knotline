import { expect, test } from "./fixtures.js";

test("@a11y operator filters runs and diagnoses live work across equivalent views", async ({
  page
}) => {
  await page.goto("/app/runs");
  await expect(page.getByRole("heading", { name: "Runs" })).toBeVisible();
  await page.getByLabel("Status").selectOption("failed");
  await expect(page.getByRole("link", { name: /Incident response/u })).toBeVisible();
  await expect(page).toHaveURL(/status=failed/u);
  await page.getByRole("link", { name: /Incident response/u }).click();
  await expect(page.getByRole("heading", { name: "Incident response" })).toBeVisible();
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("region", { name: "Run execution" })).toBeVisible();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByText("Run admitted")).toBeVisible();
});

test("run room exposes safe controls and a redacted attempt inspector on mobile", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/runs/run-1042");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Draft response/u }).click();
  await expect(page.getByRole("heading", { name: "Structured input" })).toBeVisible();
  await expect(page.getByText(/credentials and personal data redacted/u)).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
