import { expect, test } from "./fixtures.js";

const widths = [320, 480, 768, 1024, 1440, 1920] as const;

for (const width of widths) {
  test(`@visual public home at ${width}px`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "One deterministic screenshot per width"
    );
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await expect(page).toHaveScreenshot(`public-home-${width}.png`, { fullPage: true });
  });

  test(`@visual workflow shell at ${width}px`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "One deterministic screenshot per width"
    );
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/workflows");
    await expect(page.getByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await expect(page).toHaveScreenshot(`workflow-shell-${width}.png`, { fullPage: true });
  });
}

test("@a11y reduced motion and 200 percent reflow remain usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Deterministic desktop reflow profile");
  await page.setViewportSize({ width: 640, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/workflows");
  await expect(page.getByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true
  );
});
