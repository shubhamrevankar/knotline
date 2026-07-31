import { expect, test } from "./fixtures.js";

test("current app is console-clean and responsive", async ({ page }) => {
  await page.goto("/app/workflows");

  await expect(page).toHaveTitle(/Knotline/);
  await expect(page.getByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expect(page.getByRole("status")).toContainText("Database connected");
  }
  await expect(page.getByRole("region", { name: /visual workflow map/ })).toBeVisible();

  const hasViewportOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasViewportOverflow).toBe(false);
});
