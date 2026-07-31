import { expect, test } from "./fixtures.js";

test("public home meets the local Web Vitals reference smoke budget", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Pinned reference performance profile");
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __layoutShift?: number }).__layoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) {
          const target = globalThis as typeof globalThis & { __layoutShift?: number };
          target.__layoutShift = (target.__layoutShift ?? 0) + (shift.value ?? 0);
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName("first-contentful-paint", "paint")[0]?.startTime ?? 0
      )
    )
    .toBeGreaterThan(0);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const paints = performance.getEntriesByType("paint");
    const firstContentfulPaint = paints.find(
      ({ name }) => name === "first-contentful-paint"
    )?.startTime;
    return {
      cumulativeLayoutShift:
        (globalThis as typeof globalThis & { __layoutShift?: number }).__layoutShift ?? 0,
      domContentLoaded: navigation.domContentLoadedEventEnd,
      firstContentfulPaint: firstContentfulPaint ?? 0
    };
  });
  expect(metrics.domContentLoaded).toBeLessThan(3_000);
  expect(metrics.firstContentfulPaint).toBeGreaterThan(0);
  expect(metrics.firstContentfulPaint).toBeLessThan(3_000);
  expect(metrics.cumulativeLayoutShift).toBeLessThanOrEqual(0.1);
});
