import { expect, test } from "./fixtures.js";
test("@a11y exposes install metadata and public help", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const manifestBody = (await manifest.json()) as { display?: unknown };
  expect(manifestBody.display).toBe("standalone");
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "How can we help?" })).toBeVisible();
  await page.getByLabel("Search help").fill("publish workflow");
  await expect(page.getByRole("link", { name: /Build and publish a workflow/iu })).toBeVisible();
  await page.getByRole("link", { name: /Build and publish a workflow/iu }).click();
  await expect(page.getByRole("heading", { name: "Build and publish a workflow" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a workflow" })).toHaveAttribute(
    "href",
    "/app/workflows/new"
  );
  await page.goto("/help/not-a-real-guide");
  await expect(page.getByRole("heading", { name: "We couldn’t find that guide" })).toBeVisible();
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
test("help and support are responsive at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "How can we help?" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.goto("/app/support");
  await expect(page.getByRole("heading", { name: "Get help with clear ownership" })).toBeVisible();
  expect(
    await page
      .locator(".support-page")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});

test("support case creation, conversation, and diagnostic consent work end to end", async ({
  page
}) => {
  await page.goto("/app/support");
  await page.getByRole("button", { name: "Open support case" }).click();
  await page.getByLabel("Category").selectOption("product");
  await page.getByLabel("Severity").selectOption("high");
  await page.getByLabel("Subject").fill("Run stopped before approval");
  await page
    .getByLabel("What happened?")
    .fill("The customer recovery run stopped before the approval step at 10:00 UTC.");
  await page.getByRole("button", { name: "Create support case" }).click();
  await expect(page).toHaveURL(/\/app\/support\/c3300000-/u);
  await expect(page.getByRole("heading", { name: "Run stopped before approval" })).toBeVisible();
  await expect(page.getByText(/customer recovery run stopped/iu)).toBeVisible();

  await page
    .getByLabel("Add a reply")
    .fill("Request ID local-support-1001 is attached for context.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Your reply was added to the case.")).toBeVisible();
  await expect(page.getByText(/local-support-1001/iu)).toBeVisible();

  await page.getByRole("button", { name: "Generate preview" }).click();
  await expect(page.getByText("request ids")).toBeVisible();
  await expect(page.getByText("secrets", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve and prepare bundle" }).click();
  await expect(
    page.getByText("Diagnostic sharing approved. The redacted bundle is being prepared.")
  ).toBeVisible();
});

test("feedback becomes a tracked support case", async ({ page }) => {
  await page.goto("/app/feedback");
  await expect(page.getByRole("heading", { name: "Help us improve Knotline" })).toBeVisible();
  await page.getByLabel("Feedback type").selectOption("accessibility");
  await page.getByLabel("Subject").fill("Canvas keyboard focus");
  await page
    .getByLabel("What should we know?")
    .fill(
      "The focus order should return to the selected workflow node after closing the inspector."
    );
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect(page).toHaveURL(/\/app\/support\/c3300000-/u);
  await expect(
    page.getByRole("heading", { name: "[accessibility] Canvas keyboard focus" })
  ).toBeVisible();
});
