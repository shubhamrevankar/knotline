import { expect, test } from "./fixtures.js";

const approvalId = "a0000000-0000-4000-8000-000000000013";
const approval = {
  id: approvalId,
  state: "IN_REVIEW",
  state_version: 1,
  expires_at: "2030-01-01T12:00:00.000Z",
  requester_id: "10000000-0000-4000-8000-000000000010",
  title: "Authorize production release",
  risk: "high",
  eligible: true,
  packet: {
    title: "Authorize production release",
    proposedAction: "Promote release candidate 24 to the customer environment.",
    affectedResources: [{ type: "release", id: "rc-24", label: "Release candidate 24" }],
    diff: { from: "rc-23", to: "rc-24" },
    risk: { level: "high", findings: ["Customer-visible change"] },
    evidence: [],
    provenance: { workflowVersion: 8, model: "none" },
    expiresAt: "2030-01-01T12:00:00.000Z"
  },
  steps: [{ step_key: "security", state: "active", mode: "single", eligible_user_ids: [] }],
  decisions: []
};

test("@a11y reviewer inspects the exact packet and records an approval", async ({ page }) => {
  await page.route("**/v1/approvals", (route) => route.fulfill({ json: { data: [approval] } }));
  await page.route(`**/v1/approvals/${approvalId}`, (route) =>
    route.fulfill({ json: { data: approval } })
  );
  await page.route(`**/v1/approvals/${approvalId}/decisions`, (route) =>
    route.fulfill({ status: 201, json: { data: { state: "APPROVED_PENDING_EXECUTION" } } })
  );
  await page.goto("/app/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await page.getByRole("link", { name: /Authorize production release/u }).click();
  await expect(page.getByRole("heading", { name: "Proposed action" })).toBeVisible();
  await expect(page.getByText("Customer-visible change")).toBeVisible();
  await page.getByLabel("Reason").fill("Evidence is complete and the change is within policy.");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Decision recorded/u)).toBeVisible();
});

test("approval decision surface remains usable at 320 pixels", async ({ page }) => {
  await page.route(`**/v1/approvals/${approvalId}`, (route) =>
    route.fulfill({ json: { data: approval } })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/app/approvals/${approvalId}`);
  await expect(page.getByLabel("Reason")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
