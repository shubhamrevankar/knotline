import { expect, test } from "./fixtures.js";

test("@a11y guided generation reviews, safely tests, and publishes accepted output", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter the workspace" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Knotline" })).toBeVisible();
  const googleButton = page.getByRole("button", { name: "Continue with Google" });
  await expect(googleButton).toHaveCSS("align-items", "center");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "New workflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Build a workflow your team can trust" })
  ).toBeVisible();
  expect(
    await page
      .locator(".workflow-onboarding")
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom))
  ).toBeGreaterThanOrEqual(64);
  await expect(page.getByText("GOVERNED GATEWAY", { exact: true }).first()).toBeVisible();
  await page
    .getByLabel("Describe the workflow")
    .fill("Collect a launch request, require owner approval, and notify the requester.");
  await page.getByRole("button", { name: "Generate review" }).click();
  await expect(page.getByText("Generation status: READY_TO_ACCEPT")).toBeVisible();
  await expect(page.getByText("The workflow starts manually.")).toBeVisible();
  await page.getByText("Generation and validation details").click();
  await expect(page.getByText("fixture-v1")).toBeVisible();
  await expect(page.getByText("RECORDED_CONTRACT")).toBeVisible();
  await expect(page.getByText("recorded-balanced-v1")).toBeVisible();
  await expect(page.getByText("0 USD")).toBeVisible();

  await page.getByRole("button", { name: "Run safe test" }).click();
  await expect(page.getByRole("heading", { name: "Safe test report" })).toBeVisible();
  await expect(page.getByText("external writes")).toBeVisible();
  await expect(page.locator(".test-summary")).toContainText("0");
  await expect(page.getByText("Workflow run permission")).toBeVisible();

  await page.getByRole("button", { name: "Publish workflow" }).click();
  await expect(page.getByRole("heading", { name: "Your workflow is live" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View published workflow" })).toBeVisible();
});

test("mobile guided generation remains responsive and exposes review details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/workflows/new");
  await expect(
    page.getByRole("heading", { name: "Build a workflow your team can trust" })
  ).toBeVisible();
  await page
    .getByLabel("Describe the workflow")
    .fill("Collect a request and require owner approval.");
  await page.getByRole("button", { name: "Generate review" }).click();
  await expect(page.getByText("Inferred assumptions")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
