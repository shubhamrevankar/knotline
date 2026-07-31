import { expect, test } from "./fixtures.js";

test("@a11y guided generation reviews, safely tests, and publishes accepted output", async ({
  page
}) => {
  await page.goto("/app/workflows");
  await page.getByRole("main").getByRole("button", { name: "New workflow" }).click();
  await expect(page.getByText("SIMULATED", { exact: true })).toBeVisible();
  await page
    .getByLabel("Describe the workflow")
    .fill("Collect a launch request, require owner approval, and notify the requester.");
  await page.getByRole("button", { name: "Generate review" }).click();
  await expect(page.getByText("Generation status: READY_TO_ACCEPT")).toBeVisible();
  await expect(page.getByText("The workflow starts manually.")).toBeVisible();
  await expect(page.getByText("fixture-v1")).toBeVisible();
  await expect(page.getByText("0 USD")).toBeVisible();

  await page.getByRole("button", { name: "Run safe test" }).click();
  await expect(page.getByRole("heading", { name: "Safe test report" })).toBeVisible();
  await expect(page.getByText("Production side effects: 0")).toBeVisible();
  await expect(page.getByText("Workflow run permission")).toBeVisible();

  await page.getByRole("button", { name: "Accept and publish" }).click();
  await expect(page.getByRole("heading", { name: "Create a real workflow" })).not.toBeVisible();
});

test("mobile guided generation remains responsive and exposes review details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/workflows/new");
  await expect(page.getByRole("heading", { name: "Start blank" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse templates" })).toBeVisible();
  await page
    .getByLabel("Describe the workflow")
    .fill("Collect a request and require owner approval.");
  await page.getByRole("button", { name: "Generate review" }).click();
  await expect(page.getByText("Inferred assumptions")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
