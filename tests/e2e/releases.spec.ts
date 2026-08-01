import { expect, test } from "./fixtures.js";
test("@a11y shows release gates without a false deployment claim", async ({ page }) => {
  await page.goto("/ops/releases");
  await expect(
    page.getByRole("heading", { name: "Releases and rollback readiness" })
  ).toBeVisible();
  await expect(page.getByText("Not deployed", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Engineering verified", { exact: true })).toBeVisible();
});
test("release flow reflows at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/ops/releases");
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
