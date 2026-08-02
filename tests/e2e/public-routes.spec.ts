import { AxeBuilder } from "@axe-core/playwright";

import { expect, test } from "./fixtures.js";

test("public home is accessible, responsive, and links to the lazy app", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Turn complex operations into one accountable system."
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Start building" }).first()).toHaveAttribute(
    "href",
    "/auth/sign-in"
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("public home explains the product journey and keeps conversion paths real", async ({
  page
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "From process to outcome, without losing control." })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delegate the work. Keep authority explicit." })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Give operators a live room, not another status page." })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trust is part of the workflow, not a promise around it." })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Visit the security center" })).toHaveAttribute(
    "href",
    "/security"
  );
  await expect(page.getByRole("link", { name: "See how it works" })).toHaveAttribute(
    "href",
    "#platform"
  );
  await expect(page.getByRole("link", { name: /Operations/ })).toHaveAttribute(
    "href",
    "/solutions/operations"
  );
});

test("known and unknown dynamic public routes are intentional", async ({ page }) => {
  await page.goto("/solutions/operations");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Turn recurring coordination into a reliable operating system."
  );
  await page.goto("/solutions/unknown");
  await expect(page.getByRole("heading", { level: 2, name: "Page not found" })).toBeVisible();
});

test("operator routes never render the customer shell", async ({ page }) => {
  await page.goto("/ops");
  await expect(page.getByText("Knotline operator plane")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
});
