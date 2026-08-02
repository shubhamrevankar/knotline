import { AxeBuilder } from "@axe-core/playwright";

import { expect, test } from "./fixtures.js";

const publicPaths = [
  "/",
  "/accessibility",
  "/auth/check-email",
  "/auth/google/callback",
  "/auth/magic/callback",
  "/auth/sign-in",
  "/changelog",
  "/contact",
  "/docs",
  "/docs/components",
  "/guest",
  "/help",
  "/help/getting-started",
  "/invitations/accept",
  "/legal/acceptable-use",
  "/legal/dpa",
  "/legal/privacy",
  "/legal/subprocessors",
  "/legal/terms",
  "/pricing",
  "/product",
  "/product/agents",
  "/product/integrations",
  "/product/knowledge",
  "/product/workflows",
  "/security",
  "/solutions/operations",
  "/solutions/go-to-market",
  "/solutions/product",
  "/solutions/support",
  "/solutions/finance",
  "/solutions/hr",
  "/solutions/it",
  "/status",
  "/templates",
  "/templates/incident-response",
  "/trust"
] as const;

test("@a11y every public route renders an intentional accessible state", async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "Canonical axe route matrix");
  for (const path of publicPaths) {
    await page.goto(path);
    await expect(page.locator("h1, h2").first(), path).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, path).toEqual([]);
  }
});

test("@a11y authenticated shell system states are intentional", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Canonical shell-state matrix");
  for (const state of [
    "unauthenticated",
    "forbidden",
    "plan",
    "suspended",
    "archived",
    "deleted",
    "offline",
    "degraded"
  ]) {
    await page.goto(`/app/workflows?state=${state}`);
    await expect(page.getByRole("alert")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, state).toEqual([]);
  }
});

test("locale override, metadata, and consent are truthful", async ({ page }) => {
  await page.goto("/?locale=en-XA");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("［");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index,follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/$/u);

  await page.goto("/?consent=ask");
  await expect(page.getByRole("complementary", { name: /privacy controls/u })).toBeVisible();
  await page.getByRole("button", { name: "Essential only" }).click();
  await expect(page.getByRole("complementary", { name: /privacy controls/u })).toHaveCount(0);
});
