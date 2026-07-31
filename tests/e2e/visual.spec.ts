import { expect, test } from "./fixtures.js";

test("@visual current app matches its reviewed baseline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/workflows");
  await expect(page.getByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
  await expect(page.locator(".react-flow__viewport")).toBeVisible();

  await expect(page).toHaveScreenshot("workflows-page.png", {
    fullPage: true
  });
});
