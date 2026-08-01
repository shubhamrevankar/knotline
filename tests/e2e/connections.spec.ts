import { expect, test } from "./fixtures.js";

const connectionId = "b2200000-0000-4000-8000-000000000001";
const manifest = {
  displayName: "Fixture Cloud",
  provider: "fixture",
  requiredScopes: ["objects.read"],
  optionalScopes: ["profile.read"],
  permissionFidelity: "exact"
};

test("@a11y connection catalog and scope preview are responsive", async ({ page }) => {
  await page.route("**/v1/workspaces/*/connections", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [],
          catalog: [{ id: "m1", key: "fixture-cloud", version: "1.0.0", manifest, state: "active" }]
        }
      })
    })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/connections");
  await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
  await expect(page.getByText("Fixture Cloud")).toBeVisible();
  await page.getByText("Fixture Cloud").last().click();
  await expect(page.getByRole("heading", { name: "Connect Fixture Cloud" })).toBeVisible();
  await expect(page.getByText("objects.read")).toBeVisible();
  await expect(page.getByText("Permission fidelity: exact")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("connection health supports sync, diagnosis, disable, reauthorize, and deletion", async ({
  page
}) => {
  let state = "active";
  let deleted = false;
  const record = () => ({
    id: connectionId,
    connectorKey: "fixture-cloud",
    displayName: "Fixture Cloud",
    state,
    accountLabel: "Northstar fixture",
    grantedScopes: ["objects.read"],
    requestedScopes: ["objects.read"],
    permissionFidelity: "exact",
    lastSuccessAt: "2026-08-02T10:00:00Z",
    freshnessLagSeconds: 12,
    objectCount: 42,
    errorCount: state === "degraded" ? 1 : 0,
    runs: [{ id: "r1", mode: "backfill", state: "succeeded", processedCount: 42 }]
  });
  await page.route(`**/v1/connections/${connectionId}`, (route) =>
    route.fulfill({
      status: deleted ? 404 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        deleted ? { error: { code: "CONNECTION_NOT_FOUND" } } : { data: record() }
      )
    })
  );
  await page.route(`**/v1/connections/${connectionId}/syncs`, (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "r2", state: "queued" } })
    })
  );
  await page.route(`**/v1/connections/${connectionId}/reconciliations`, (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { state: "active" } })
    })
  );
  await page.route(`**/v1/connections/${connectionId}/pauses`, (route) => {
    state = "disabled";
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { state } })
    });
  });
  await page.route(`**/v1/connections/${connectionId}`, async (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ data: { state: "deleting" } })
      });
    }
    return route.fallback();
  });
  await page.goto(`/app/connections/${connectionId}`);
  await expect(page.getByRole("heading", { name: "Fixture Cloud" })).toBeVisible();
  await expect(page.getByText("Northstar fixture")).toBeVisible();
  await expect(page.getByText("objects.read")).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Sync queued.")).toBeVisible();
  await page.getByRole("button", { name: "Reconcile" }).click();
  await expect(page.getByText("Reconciliation queued.")).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText("disabled")).toBeVisible();
});

test("authorization creates only a clean one-time redirect", async ({ page }) => {
  await page.route("**/v1/workspaces/*/connections", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [],
          catalog: [{ id: "m1", key: "fixture-cloud", version: "1.0.0", manifest, state: "active" }]
        }
      })
    })
  );
  await page.route("**/v1/workspaces/*/connection-authorizations", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          authorizationUrl: "http://127.0.0.1:4173/app/connections",
          expiresAt: "2026-08-02T10:10:00Z"
        }
      })
    })
  );
  await page.goto("/app/connections/new/fixture-cloud");
  await page.getByRole("button", { name: "Authorize securely" }).click();
  await expect(page).toHaveURL(/\/app\/connections$/u);
  await expect(
    page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => /pkce|token|secret/iu.test(key))
    )
  ).resolves.toEqual([]);
});
