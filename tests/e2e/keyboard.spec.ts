import { expect, test } from "./fixtures.js";

test("@keyboard mobile navigation opens, closes, and restores focus", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile drawer journey");
  await page.goto("/");

  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  await page.keyboard.press("Tab");
  await expect(openNavigation).toBeFocused();

  await page.keyboard.press("Enter");
  const closeNavigation = page.getByRole("button", { name: "Close navigation" });
  await expect(closeNavigation).toBeFocused();
  await expect(openNavigation).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(openNavigation).toBeFocused();
  await expect(openNavigation).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Find anything" })).toBeFocused();
});
