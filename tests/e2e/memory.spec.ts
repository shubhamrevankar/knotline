import { expect, test } from "./fixtures.js";

const agentId = "a1400000-0000-4000-8000-000000000001";
const memoryId = "a1700000-0000-4000-8000-000000000001";

test("@a11y user-private memory supports inspect, correct, export, and delete", async ({
  page
}) => {
  let deleted = false;
  await page.route("**/v1/me/memory-records**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith("/corrections")) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { version: 2 } })
      });
      return;
    }
    if (method === "DELETE") {
      deleted = true;
      await route.fulfill({ status: 204 });
      return;
    }
    const record = {
      id: memoryId,
      agent_id: agentId,
      subject_id: "preference:locale",
      purpose: "Remember preferred report language",
      sensitivity: "confidential",
      state: "active",
      current_version: 1,
      value: { locale: "en" },
      value_hash: "a".repeat(64),
      source_references: ["input-1"],
      provenance: { executionId: "execution-1" },
      retention_expires_at: "2027-08-01T00:00:00.000Z"
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: url.pathname.endsWith(memoryId) ? record : deleted ? [] : [record]
      })
    });
  });
  await page.route("**/v1/me/memory-exports", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: memoryId }] })
    })
  );
  await page.goto("/app/profile/memory");
  await expect(page.getByRole("heading", { name: "My agent memory" })).toBeVisible();
  await page.getByRole("button", { name: /Remember preferred report language/u }).click();
  await expect(page.getByRole("heading", { name: "Memory provenance" })).toBeVisible();
  await expect(page.getByText("confidential")).toBeVisible();
  await page.getByRole("button", { name: "Record correction" }).click();
  await expect(page.getByText("Correction version 2 recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Export my memory" }).click();
  await expect(page.getByText("1 private memory records prepared for export.")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete memory" }).click();
  await expect(page.getByText(/removed from future context/u)).toBeVisible();
});

test("agent memory administration shows policy and workspace-shared records only", async ({
  page
}) => {
  await page.route(`**/v1/agents/${agentId}/memory-policy`, async (route) => {
    const method = route.request().method();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data:
          method === "PUT"
            ? { revision: 2 }
            : {
                agent_id: agentId,
                revision: "1",
                definition: {
                  allowedScopes: ["execution", "user_private", "workspace_shared"],
                  retentionDays: 365,
                  maxRecordsPerSubject: 10,
                  allowSensitive: false,
                  requireSourceReferences: true,
                  disabled: false
                }
              }
      })
    });
  });
  await page.route("**/v1/workspaces/*/memory-records*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: memoryId,
            agent_id: agentId,
            subject_id: "workspace:procedure",
            purpose: "Approved escalation procedure",
            sensitivity: "internal",
            state: "active",
            current_version: 1,
            value_hash: "b".repeat(64)
          }
        ]
      })
    })
  );
  await page.goto(`/app/agents/${agentId}/memory`);
  await expect(page.getByRole("heading", { name: "Agent memory" })).toBeVisible();
  await expect(page.getByText("Approved escalation procedure")).toBeVisible();
  await expect(page.getByText(/User-private records are excluded/u)).toBeVisible();
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByText("Memory policy revision 2 saved.")).toBeVisible();
});
