import { AxeBuilder } from "@axe-core/playwright";

import { expect, test } from "./fixtures.js";

test("Pulse presents a useful local operational snapshot", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Pulse", exact: true })).toBeVisible();
  await expect(page.getByText("Local demonstration data")).toBeVisible();
  await expect(page.getByText("96.4%")).toBeVisible();
  await expect(page.getByText("18.6 min")).toBeVisible();
  await expect(page.getByText("146.5 hrs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Executive operations brief" })).toBeVisible();
  await expect(page.getByRole("link", { name: /View live runs/ })).toHaveAttribute(
    "href",
    "/app/runs"
  );
});

test("Pulse remains responsive at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Pulse", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
});

test("@a11y Pulse has no automated WCAG A or AA violations", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Pulse", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
