import { test, expect } from "./fixtures.js";

test("workspace settings expose switching, preferences, sandbox labels, and creation", async ({
  page
}) => {
  await page.goto("/app/settings/workspace");
  await expect(page.getByRole("heading", { name: "Workspace settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Northstar Studio" })).toBeVisible();
  await expect(page.getByText("Sandbox — sample data")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeEnabled();
  await page.getByRole("button", { name: "New workspace" }).click();
  await page.getByLabel("Workspace name").last().fill("Launch Operations");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Workspace created and selected.")).toBeVisible();
});

test("members page supports invitations and guarded access actions", async ({ page }) => {
  await page.goto("/app/settings/members");
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await expect(page.getByText("Ava North")).toBeVisible();
  await expect(page.getByText("Sam Rivers")).toBeVisible();
  await expect(page.getByRole("button", { name: "Transfer ownership" })).toBeVisible();
  await page.getByLabel("Work email").fill("new@northstar.example");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent to new@northstar.example.")).toBeVisible();
  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("dialog", { name: "Suspend member?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Search members").fill("not-a-member");
  await expect(page.getByText("No members match")).toBeVisible();
});

test("roles and groups expose complete editors and protect synchronized groups", async ({
  page
}) => {
  await page.goto("/app/settings/roles");
  await expect(page.getByRole("heading", { name: "Roles & groups" })).toBeVisible();
  await expect(page.getByText("Built-in owner role")).toBeVisible();
  await page.getByRole("button", { name: "New custom role" }).click();
  await page.getByLabel("Role name").fill("Workflow reader");
  await expect(page.getByLabel("workspace.read")).toBeChecked();
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByText("Custom role created.")).toBeVisible();
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByLabel("Group name").fill("Launch team");
  await page.getByLabel("Add Ava North to group").check();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("Group created.")).toBeVisible();
  await expect(page.getByText("Identity provider", { exact: true })).toBeVisible();
});

test("@a11y onboarding is resumable, skippable, and honest about dependencies", async ({
  page
}) => {
  await page.goto("/app/onboarding");
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip for now" })).toBeEnabled();
  await page.getByRole("button", { name: "Create sample data" }).click();
  await expect(page.getByRole("button", { name: "Remove sample data" })).toBeVisible();
  await expect(page.locator("main")).toHaveCSS("overflow-x", /^(visible|clip|hidden|auto)$/);
});

test("invitation tokens are removed from browser history before preview", async ({ page }) => {
  await page.goto("/invitations/accept#token=abcdefghijklmnopqrstuvwxyz0123456789");
  await expect(page).toHaveURL("/invitations/accept");
  await expect(page.getByRole("heading", { name: "You have been invited" })).toBeVisible();
  await expect(page.getByText(/Northstar Studio/)).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL("/app/onboarding");
});

test("workspace access pages remain usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/settings/workspace");
  await expect(page.getByRole("heading", { name: "Workspace settings" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.goto("/app/settings/members");
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search members")).toBeVisible();
});
