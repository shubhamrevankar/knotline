import { expect, test } from "./fixtures.js";

const primaryPages = [
  { path: "/app", eyebrow: "01 / Overview", title: "Pulse" },
  { path: "/app/workflows", eyebrow: "02 / Operations", title: "Workflows" },
  { path: "/app/runs", eyebrow: "03 / Execution", title: "Runs" },
  { path: "/app/agents", eyebrow: "04 / Intelligence", title: "Agent catalog" },
  { path: "/app/settings/members", eyebrow: "05 / Organization", title: "People" },
  { path: "/app/connections", eyebrow: "06 / Integrations", title: "Connections" }
] as const;

test("the six primary workspace pages share one numbered heading system", async ({ page }) => {
  const titleStyles: string[] = [];
  const eyebrowStyles: string[] = [];
  const primaryGutters: number[] = [];

  for (const item of primaryPages) {
    await page.goto(item.path);
    const header = page.locator(".workspace-page-header").first();
    await expect(header.getByText(item.eyebrow, { exact: true })).toBeVisible();
    await expect(header.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    titleStyles.push(
      await header.locator("h1").evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight].join("|");
      })
    );
    eyebrowStyles.push(
      await header.locator(".workspace-page-header__eyebrow").evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.fontFamily, style.fontSize, style.fontWeight, style.letterSpacing].join("|");
      })
    );
    if (
      ["/app", "/app/workflows", "/app/runs", "/app/settings/members", "/app/connections"].includes(
        item.path
      )
    )
      primaryGutters.push(await header.evaluate((element) => element.getBoundingClientRect().left));
  }

  expect(new Set(titleStyles).size).toBe(1);
  expect(new Set(eyebrowStyles).size).toBe(1);
  expect(new Set(primaryGutters).size).toBe(1);
});
