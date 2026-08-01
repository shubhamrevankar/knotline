import { expect, test } from "./fixtures.js";
test("@a11y exposes operator health and safe control previews", async ({ page }) => {
  await page.goto("/ops/runtime");
  await expect(
    page.getByRole("heading", { name: "Health, incidents, and safe controls" })
  ).toBeVisible();
  await expect(page.getByText("Fixture only")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview connector quarantine" }).click();
  await expect(page.getByText("No declared production incident")).toBeVisible();
});
test("operator console reflows on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/ops");
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
