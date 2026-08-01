import { expect, test } from "./fixtures.js";
test("@a11y billing shows honest provider, usage, and budget state", async ({ page }) => {
  await page.route("**/v1/auth/bootstrap", async (route) =>
    route.fulfill({
      json: {
        data: {
          user: {
            id: "u",
            displayName: "Maya",
            email: "maya@example.test",
            status: "active",
            locale: "en",
            timezone: "UTC"
          },
          workspace: { id: "00000000-0000-4000-8000-000000000001" },
          csrfToken: "csrf"
        }
      }
    })
  );
  await page.route("**/v1/workspaces/*/subscription", async (route) =>
    route.fulfill({
      json: {
        data: {
          subscription: {
            planName: "Team",
            state: "active",
            periodEnd: "2026-09-01T00:00:00Z",
            cancelAtPeriodEnd: false
          },
          invoices: [],
          paymentDataStored: false,
          providerState: "projected"
        }
      }
    })
  );
  await page.route("**/v1/workspaces/*/usage", async (route) =>
    route.fulfill({
      json: {
        data: { dimensions: [], freshThrough: null, partial: true, adjustmentsIncluded: true }
      }
    })
  );
  await page.route("**/v1/workspaces/*/budgets", async (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.goto("/app/settings/billing");
  await expect(page.getByRole("heading", { name: "Billing and spend" })).toBeVisible();
  await expect(page.getByText("Knotline never stores raw card data.")).toBeVisible();
  await expect(page.getByText("No billed usage yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop new paid work" })).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
test("usage route remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/v1/auth/bootstrap", async (route) =>
    route.fulfill({
      json: {
        data: {
          user: {
            id: "u",
            displayName: "Maya",
            email: "maya@example.test",
            status: "active",
            locale: "en",
            timezone: "UTC"
          },
          workspace: { id: "00000000-0000-4000-8000-000000000001" },
          csrfToken: "csrf"
        }
      }
    })
  );
  await page.route("**/v1/workspaces/*/subscription", async (route) =>
    route.fulfill({
      json: {
        data: {
          subscription: null,
          invoices: [],
          paymentDataStored: false,
          providerState: "not_configured"
        }
      }
    })
  );
  await page.route("**/v1/workspaces/*/usage", async (route) =>
    route.fulfill({
      json: {
        data: {
          dimensions: [
            { meter: "runs", quantity: "42", unit: "run", amount: "4.20", currency: "USD" }
          ],
          freshThrough: "2026-08-01T00:00:00Z",
          partial: false,
          adjustmentsIncluded: true
        }
      }
    })
  );
  await page.route("**/v1/workspaces/*/budgets", async (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.goto("/app/settings/usage");
  await expect(page.getByText("42 run · USD 4.20")).toBeVisible();
});
