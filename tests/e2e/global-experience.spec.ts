import { expect, test } from "./fixtures.js";
test("@a11y exposes install metadata and public help", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help center" })).toBeVisible();
  await page.goto("/status");
  await expect(page.getByText("Application: Operational")).toBeVisible();
});
test("contact returns a durable queued receipt", async ({ page }) => {
  await page.route("**/edge/v1/contact-requests", (r) =>
    r.fulfill({
      status: 202,
      json: {
        data: {
          id: "c1000000-0000-4000-8000-000000000001",
          accepted: true,
          state: "queued",
          routingReceipt: "queue:c1"
        }
      }
    })
  );
  await page.goto("/contact");
  await page.getByLabel("Work email").fill("person@example.test");
  await page.getByLabel("Company").fill("Example");
  await page.getByLabel("Message").fill("We want to discuss a reliable workflow deployment.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/is queued/)).toBeVisible();
});
test("support history is responsive", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/v1/support-tickets", (r) => r.fulfill({ json: { data: [] } }));
  await page.goto("/app/support");
  await expect(page.getByRole("heading", { name: "Get help with clear ownership" })).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
