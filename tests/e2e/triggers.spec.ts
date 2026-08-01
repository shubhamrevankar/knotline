import { expect, test } from "./fixtures.js";

const workflowId = "wf_launch-campaign";
const triggerId = "b2600000-0000-4000-8000-000000000001";

test("@a11y trigger operations are responsive and isolate a noisy trigger", async ({ page }) => {
  let state: "enabled" | "disabled" = "enabled";
  let deliveries: unknown[] = [];
  const item = () => ({
    id: triggerId,
    triggerKey: "schedule-daily-review",
    kind: "schedule",
    state,
    version: 2,
    environment: "test",
    schemaVersion: "1.0",
    cron: "0 9 * * 1-5",
    timeZone: "Asia/Kolkata",
    errorCount: 0,
    backlogCount: deliveries.length,
    disabledReason: state === "disabled" ? "Paused by operator" : undefined
  });
  await page.route(`**/v1/workflows/${workflowId}/triggers`, async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: item() })
      });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [item()] })
    });
  });
  await page.route(`**/v1/workflow-triggers/${triggerId}/deliveries`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: deliveries }) })
  );
  await page.route(`**/v1/workflow-triggers/${triggerId}/disables`, (route) => {
    state = "disabled";
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: item() })
    });
  });
  await page.route(`**/v1/workflow-triggers/${triggerId}/enables`, (route) => {
    state = "enabled";
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: item() })
    });
  });
  await page.route(`**/v1/workflow-triggers/${triggerId}/test-events`, (route) => {
    deliveries = [
      {
        id: "receipt-1",
        provider: "fixture",
        sourceId: "operator-simulator",
        receivedAt: "2026-08-01T10:00:00.000Z",
        state: "queued",
        queueState: "buffered"
      }
    ];
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "receipt-1", state: "queued" } })
    });
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/app/workflows/${workflowId}/triggers`);
  await expect(page.getByRole("heading", { name: "Workflow triggers" })).toBeVisible();
  await expect(page.getByText("schedule-daily-review")).toBeVisible();
  await page.getByRole("button", { name: "Send test event" }).click();
  await expect(page.getByText("Test event queued.")).toBeVisible();
  await expect(page.getByText("operator-simulator")).toBeVisible();
  await page.getByRole("button", { name: "Pause trigger" }).click();
  await expect(page.getByText("Trigger paused without affecting other workflows.")).toBeVisible();
  await expect(page.getByText("Paused by operator")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("schedule creator exposes cron and IANA time zone", async ({ page }) => {
  let created = false;
  await page.route(`**/v1/workflows/${workflowId}/triggers`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        type: string;
        environment: string;
        schedule?: { cron: string; timeZone: string };
      };
      expect(body).toMatchObject({
        type: "schedule",
        environment: "test",
        schedule: { cron: "15 8 * * 1-5", timeZone: "Europe/Paris" }
      });
      created = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: triggerId } })
      });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  await page.goto(`/app/workflows/${workflowId}/triggers`);
  await page.getByLabel("Trigger type").selectOption("schedule");
  await page.getByLabel("Cron expression").fill("15 8 * * 1-5");
  await page.getByLabel("IANA time zone").fill("Europe/Paris");
  await page.getByRole("button", { name: "Create test trigger" }).click();
  await expect(page.getByText("Trigger configuration created in test mode.")).toBeVisible();
  expect(created).toBe(true);
});
