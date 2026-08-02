import { expect, test } from "./fixtures.js";

test("public header links to complete product destinations", async ({ page }) => {
  await page.goto("/");
  const header = page.locator(".site-header");
  await expect(header.getByRole("link", { name: "Knotline home" })).toBeVisible();
  const chooseMenuLink = async (menu: string, link: RegExp) => {
    const mobileButton = header.getByRole("button", { name: "Open navigation" });
    if (await mobileButton.isVisible()) {
      await mobileButton.click();
      const mobileNavigation = header.locator("#public-mobile-navigation");
      await mobileNavigation
        .locator("summary")
        .filter({ hasText: new RegExp(`^${menu}`) })
        .click();
      await mobileNavigation.getByRole("link", { name: link }).click();
      return;
    }
    await header.getByRole("button", { name: menu }).click();
    await header.getByRole("link", { name: link }).click();
  };

  await chooseMenuLink("Product", /Workflows/);
  await expect(page).toHaveURL(/\/product\/workflows$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Build operations that remain clear"
  );

  await chooseMenuLink("Solutions", /Customer support/);
  await expect(page).toHaveURL(/\/solutions\/support$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Resolve complex customer issues"
  );

  await chooseMenuLink("Resources", /Documentation/);
  await expect(page).toHaveURL(/\/docs$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Build, operate");

  const mobileButton = header.getByRole("button", { name: "Open navigation" });
  if (await mobileButton.isVisible()) {
    await mobileButton.click();
    await header
      .locator("#public-mobile-navigation")
      .getByRole("link", { name: "Pricing" })
      .click();
  } else {
    await header.getByRole("link", { name: "Pricing" }).click();
  }
  await expect(page).toHaveURL(/\/pricing$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Choose the operating foundation"
  );
});

test("every primary public destination is intentional", async ({ page }) => {
  const destinations = [
    ["/product", "One place for people and agents"],
    ["/product/agents", "AI teammates with a job description"],
    ["/product/knowledge", "Give work the right context"],
    ["/product/integrations", "Connect the systems"],
    ["/templates", "Start with the shape"],
    ["/security", "Trust is part of the operating model"],
    ["/help", "How can we help?"]
  ] as const;
  for (const [path, heading] of destinations) {
    await page.goto(path);
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await expect(page.getByText(/Planned product surface|Available preview/)).toHaveCount(0);
  }
});

test("resources contain useful interactive and detailed states", async ({ page }) => {
  await page.goto("/product/integrations");
  await page.getByPlaceholder("Search integrations").fill("github");
  await expect(page.getByRole("heading", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Salesforce" })).toHaveCount(0);

  await page.goto("/templates/incident-response");
  await expect(page.getByRole("heading", { name: "Customer incident recovery" })).toBeVisible();
  await expect(page.getByText("Request remediation approval")).toBeVisible();

  await page.goto("/docs/getting-started");
  await expect(page.getByRole("heading", { name: "Get started with Knotline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Publish and run" })).toBeVisible();

  await page.goto("/pricing");
  await expect(page.getByRole("table", { name: "Plan capability comparison" })).toBeVisible();
  await expect(page.getByText("Talk to us for current pricing")).toHaveCount(3);
});

test("mobile navigation is usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation).toBeVisible();
  await navigation.getByText("Resources", { exact: true }).click();
  await navigation.getByRole("link", { name: /Security/ }).click();
  await expect(page).toHaveURL(/\/security$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Trust is part");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
});

test("workspace pages use the sidebar without the public header", async ({ page }) => {
  await page.goto("/app/workflows");
  await expect(page.locator(".site-header")).toHaveCount(0);
});
