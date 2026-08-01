import { expect, test } from "./fixtures.js";
const workspace = "10000000-0000-4000-8000-000000000001";
test("@a11y tests enterprise SSO without enforcing it", async ({ page }) => {
  let state = "draft";
  await page.route(`**/v1/workspaces/${workspace}/sso-connections`, async (r) =>
    r.request().method() === "POST"
      ? r.fulfill({
          status: 201,
          json: {
            data: {
              id: "e1000000-0000-4000-8000-000000000001",
              name: "Workforce identity",
              protocol: "saml",
              issuer: "https://identity.example.test",
              state,
              revision: 1
            }
          }
        })
      : r.fulfill({ json: { data: [] } })
  );
  await page.route("**/v1/sso-connections/*/tests", (r) => {
    state = "tested";
    return r.fulfill({
      status: 202,
      json: {
        data: {
          id: "e1000000-0000-4000-8000-000000000001",
          name: "Workforce identity",
          protocol: "saml",
          issuer: "https://identity.example.test",
          state,
          revision: 2
        }
      }
    });
  });
  await page.route(`**/v1/workspaces/${workspace}/domains`, (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.route(`**/v1/workspaces/${workspace}/enterprise-policies`, (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.goto("/app/settings/identity");
  await page.getByRole("button", { name: "Add SAML connection" }).click();
  await expect(page.getByText("SAML · draft")).toBeVisible();
  await page.getByRole("button", { name: "Run safe test" }).click();
  await expect(page.getByText("tested", { exact: true })).toBeVisible();
});
test("enterprise settings reflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ["sso-connections", "domains", "enterprise-policies"])
    await page.route(`**/v1/workspaces/${workspace}/${path}`, (r) =>
      r.fulfill({ json: { data: [] } })
    );
  await page.goto("/app/settings/policies");
  await expect(page.getByRole("heading", { name: "Policy impact" })).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  ).toBe(true);
});
