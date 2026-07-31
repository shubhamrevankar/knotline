import { AxeBuilder } from "@axe-core/playwright";

import { expect, test } from "./fixtures.js";

test("public home is accessible, responsive, and links to the lazy app", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Operational work, made legible." })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore the demo" })).toHaveAttribute(
    "href",
    "/app/workflows"
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("known and unknown dynamic public routes are intentional", async ({ page }) => {
  await page.goto("/solutions/operations");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Operations");
  await page.goto("/solutions/unknown");
  await expect(page.getByRole("heading", { level: 2, name: "Page not found" })).toBeVisible();
});

test("operator routes never render the customer shell", async ({ page }) => {
  await page.goto("/ops");
  await expect(page.getByText("Knotline operator plane")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
});
