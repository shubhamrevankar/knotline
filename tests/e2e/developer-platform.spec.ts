import { expect, test } from "./fixtures.js";
const workspace = "10000000-0000-4000-8000-000000000001";
test("@a11y creates a scoped one-time API credential", async ({ page }) => {
  let created = false;
  await page.route(`**/v1/workspaces/${workspace}/service-principals`, async (route) => {
    if (route.request().method() === "POST") {
      created = true;
      return route.fulfill({
        status: 201,
        json: {
          data: {
            id: "d3000000-0000-4000-8000-000000000001",
            name: "Run automation",
            purpose: "Start and observe approved workflow runs",
            role: "automation",
            scopes: ["runs:read", "runs:start"],
            environment: "test",
            state: "active",
            revision: 1
          }
        }
      });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.route("**/v1/service-principals/*/credentials", (route) =>
    route.fulfill({
      status: 201,
      json: {
        data: {
          id: "credential",
          prefix: "kn_test_example",
          token: "kn_test_example.one-time-secret",
          displayedOnce: true
        }
      }
    })
  );
  await page.route(`**/v1/workspaces/${workspace}/outgoing-webhooks`, (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.goto("/app/developer/api");
  await page.getByRole("button", { name: "Create test credential" }).click();
  await expect(page.getByText("Copy this secret now")).toBeVisible();
  await expect(page.getByText("kn_test_example.one-time-secret")).toBeVisible();
  expect(created).toBe(true);
});
test("developer webhook portal is responsive", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route(`**/v1/workspaces/${workspace}/service-principals`, (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.route(`**/v1/workspaces/${workspace}/outgoing-webhooks`, (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "d3000000-0000-4000-8000-000000000002",
            name: "Terminal events",
            endpointUrl: "https://example.test/events",
            eventTypes: ["run.succeeded"],
            state: "active",
            revision: 1
          }
        ]
      }
    })
  );
  await page.goto("/app/developer/webhooks");
  await expect(page.getByText("Terminal events")).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
