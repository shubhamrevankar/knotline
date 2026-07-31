import { test, expect } from "./fixtures.js";

const workflowId = "wf_launch-campaign";

test("builder creates a persisted workflow draft from the workflow library", async ({ page }) => {
  await page.goto("/app/workflows");
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "New workflow" }).click();
  await page.getByLabel("Workflow name").fill("Customer escalation");
  await page.getByLabel("Description").fill("Route and resolve escalations");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: "Create a real workflow" })).not.toBeVisible();
});

test("@a11y builder validates and publishes an immutable workflow version", async ({ page }) => {
  await page.goto(`/app/workflows/${workflowId}`);
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();
  await expect(page.getByText("v8 · r3")).toBeVisible();
  await page.getByRole("button", { name: "Validate graph" }).click();
  await expect(page.getByRole("status")).toContainText("valid and publishable");
  await page.getByRole("button", { name: "Publish immutable version" }).click();
  await expect(page.getByRole("status")).toContainText("Version 8 was published");
  await expect(page.getByText("Capture signal")).toBeVisible();
});

test("version history supports inspection, semantic diff, and restore-as-draft", async ({
  page
}) => {
  await page.goto(`/app/workflows/${workflowId}/versions`);
  await expect(page.getByRole("heading", { name: "Workflow version history" })).toBeVisible();
  await expect(page.getByText("Ready for launch")).toBeVisible();
  await page.getByRole("button", { name: "Compare latest versions" }).click();
  await expect(page.getByText(/addedNodes/)).toBeVisible();
  await page.getByRole("button", { name: "Restore as new draft" }).last().click();
  await expect(page.getByRole("status")).toContainText("restored into a new draft");
  await page.getByRole("link", { name: "Inspect version" }).last().click();
  await expect(page.getByRole("heading", { name: "Version 8 definition" })).toBeVisible();
});

test("workspace templates preview and instantiate a real draft", async ({ page }) => {
  await page.goto("/app/templates");
  await expect(page.getByRole("heading", { name: "Workflow templates" })).toBeVisible();
  await expect(page.getByText("Reusable launch governance")).toBeVisible();
  await page.getByRole("button", { name: "Use template" }).click();
  await expect(page.getByRole("status")).toContainText("new workflow draft");
});

test("workflow lifecycle pages remain responsive on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/workflows/${workflowId}`);
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.goto(`/app/workflows/${workflowId}/versions`);
  await expect(page.getByText("Ready for launch")).toBeVisible();
});
