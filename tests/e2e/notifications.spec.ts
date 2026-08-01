import { expect, test } from "./fixtures.js";

const notificationId = "d2700000-0000-4000-8000-000000000001";
const workspaceId = "10000000-0000-4000-8000-000000000001";

test("@a11y notification center groups, deep-links, and marks logical reads", async ({ page }) => {
  let read = false;
  const item = {
    id: notificationId,
    groupKey: "assigned-work",
    title: "A task needs your review",
    body: "Review the launch brief before its due date.",
    deepLink: "/app/tasks/40000000-0000-4000-8000-000000000001",
    ...(read ? { readAt: "2026-08-01T10:05:00.000Z" } : {}),
    createdAt: "2026-08-01T10:00:00.000Z",
    eventType: "task.assigned",
    priority: "normal"
  };
  await page.route("**/v1/me/notifications?filter=*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: read && route.request().url().endsWith("unread") ? [] : [item] })
    })
  );
  await page.route(`**/v1/me/notifications/${notificationId}/read`, (route) => {
    read = true;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { id: notificationId, readAt: "2026-08-01T10:05:00.000Z" } })
    });
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/notifications");
  await expect(page.getByRole("heading", { name: "Your notifications" })).toBeVisible();
  await expect(page.getByText("Review the launch brief before its due date.")).toBeVisible();
  await page.getByRole("button", { name: "Mark read" }).click();
  await page.getByRole("button", { name: "Unread" }).click();
  await expect(page.getByRole("heading", { name: "You are all caught up" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("notification preferences preserve mandatory security delivery", async ({ page }) => {
  let saved = false;
  const preferences = [
    {
      eventType: "task.assigned",
      channels: { in_app: "immediate", email: "daily_digest" },
      quietStart: "22:00",
      quietEnd: "07:00",
      timeZone: "Asia/Kolkata",
      language: "en",
      revision: 1
    },
    {
      eventType: "security.account_compromised",
      channels: { in_app: "immediate", email: "immediate" },
      timeZone: "Asia/Kolkata",
      language: "en",
      revision: 1
    }
  ];
  await page.route("**/v1/me/notification-preferences", async (route) => {
    if (route.request().method() === "PATCH") {
      saved = true;
      const body = route.request().postDataJSON() as { preferences: typeof preferences };
      expect(
        body.preferences.find((item) => item.eventType.startsWith("security."))?.channels.email
      ).toBe("immediate");
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: preferences })
    });
  });
  await page.route(`**/v1/workspaces/${workspaceId}/notification-preferences`, async (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          mandatoryEvents: ["security.account_compromised", "security.credential_revoked"],
          escalationPolicy: { criticalBypass: true },
          rateLimits: { perUserPerHour: 100 },
          replyPolicy: "no_reply",
          revision: 0
        }
      })
    })
  );
  await page.goto("/app/settings/notifications");
  await expect(page.getByRole("heading", { name: "Notification settings" })).toBeVisible();
  await expect(page.getByLabel("Email cadence").nth(1)).toBeDisabled();
  await page.getByLabel("IANA time zone").fill("Europe/Paris");
  await page.getByRole("button", { name: "Save delivery preferences" }).click();
  await expect(page.getByText("Notification and escalation preferences saved.")).toBeVisible();
  expect(saved).toBe(true);
});
