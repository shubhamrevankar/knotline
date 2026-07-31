import { expect, test } from "./fixtures.js";

test("@a11y email sign-in keeps credentials out of the cleaned callback URL", async ({ page }) => {
  const requestUrls: string[] = [];
  const referrers: string[] = [];
  page.on("request", (request) => {
    requestUrls.push(request.url());
    const referrer = request.headers().referer;
    if (referrer) referrers.push(referrer);
  });
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Knotline" })).toBeVisible();
  await page.getByLabel("Work email").fill("ava@northstar.example");
  await page.getByRole("button", { name: "Email me a secure link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(
    "/auth/magic/callback#token=local-browser-magic-token-credential-value&intent=login"
  );
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible();
  expect(page.url()).not.toContain("token");
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(
    "local-browser-magic-token"
  );
  expect(requestUrls.join("\n")).not.toContain("local-browser-magic-token");
  expect(referrers.join("\n")).not.toContain("local-browser-magic-token");
});

test("Google sandbox flow exchanges a browser-bound result and lands cleanly", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible();
  expect(page.url()).not.toContain("result");
  expect(page.url()).not.toContain("code");
  expect(page.url()).not.toContain("state");
});

test("session inventory is usable on desktop and mobile", async ({ page }) => {
  await page.goto("/app/profile/sessions");
  await expect(page.getByRole("heading", { name: "Active sessions" })).toBeVisible();
  await expect(page.getByText("Chromium on local test device")).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke other sessions" })).toBeVisible();
});

test("profile preferences load and save without exposing identity credentials", async ({
  page
}) => {
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Profile preferences" })).toBeVisible();
  await page.getByLabel("Display name").fill("Ava Northstar");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Profile preferences saved");
  await expect(page.getByLabel("Verified email")).toBeDisabled();
});

test("an XSS fixture cannot read an HttpOnly session credential", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "__Host-knotline-session",
      value: "xss-fixture-session-verifier",
      url: "https://127.0.0.1/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  await page.goto("/auth/sign-in");
  expect(await page.evaluate(() => document.cookie)).not.toContain("xss-fixture-session-verifier");
});
