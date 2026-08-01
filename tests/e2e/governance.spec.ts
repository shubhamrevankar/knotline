import { expect, test } from "./fixtures.js";
const workspace = "10000000-0000-4000-8000-000000000001";
test("@a11y manages retention and preserves a legal hold", async ({ page }) => {
  await page.route(`**/v1/workspaces/${workspace}/audit-events`, (r) =>
    r.fulfill({
      json: {
        data: [
          {
            id: "a",
            sequence: 1,
            action: "workspace.created",
            resourceType: "workspace",
            result: "succeeded",
            eventHash: "abc",
            occurredAt: "2026-08-01T00:00:00Z"
          }
        ]
      }
    })
  );
  await page.route(`**/v1/workspaces/${workspace}/retention-policies`, async (r) =>
    r.request().method() === "PUT"
      ? r.fulfill({
          json: {
            data: [
              { dataClass: "run_content", durationDays: 365, action: "delete", version: 1 },
              { dataClass: "audit", durationDays: 2555, action: "archive", version: 1 }
            ]
          }
        })
      : r.fulfill({ json: { data: [] } })
  );
  await page.route(`**/v1/workspaces/${workspace}/legal-holds`, async (r) =>
    r.request().method() === "POST"
      ? r.fulfill({
          status: 201,
          json: {
            data: {
              id: "h",
              caseReference: "CASE-2026-001",
              reason: "Preserve records for an authorized review",
              state: "active"
            }
          }
        })
      : r.fulfill({ json: { data: [] } })
  );
  await page.route(`**/v1/workspaces/${workspace}/support-access`, (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.goto("/app/settings/data");
  await expect(
    page.getByRole("heading", { name: "Audit, privacy, and data control" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply safe defaults" }).click();
  await expect(page.getByText(/run_content: 365 days/)).toBeVisible();
  await page.getByRole("button", { name: "Create legal hold" }).click();
  await expect(page.getByText("CASE-2026-001", { exact: false })).toBeVisible();
});
test("governance center reflows at 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ["audit-events", "retention-policies", "legal-holds", "support-access"])
    await page.route(`**/v1/workspaces/${workspace}/${path}`, (r) =>
      r.fulfill({ json: { data: [] } })
    );
  await page.goto("/app/settings/audit");
  await expect(page.getByText("Immutable audit")).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
