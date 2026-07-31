import { expect, test } from "./fixtures.js";

test("current app is console-clean and responsive", async ({ page }) => {
  await page.goto("/app/workflows");

  await expect(page).toHaveTitle(/Knotline/);
  await expect(page.getByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
  await expect(page.getByRole("note", { name: "Demo environment" })).toContainText(
    "No production activity"
  );
  await expect(page.getByRole("region", { name: /visual workflow map/ })).toBeVisible();

  const hasViewportOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasViewportOverflow).toBe(false);
});
