import { expect, test } from "./fixtures.js";
test("@a11y separates implemented security controls from external assurance", async ({ page }) => {
  await page.goto("/ops/security");
  await expect(
    page.getByRole("heading", { name: "Controls, evidence, and honest claims" })
  ).toBeVisible();
  await expect(page.getByText("blocked external", { exact: true })).toHaveCount(2);
  await expect(page.getByText("no result claimed", { exact: false })).toHaveCount(2);
});
test("security assurance reflows at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/ops/security");
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
