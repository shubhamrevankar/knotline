import { expect, test } from "./fixtures.js";

test("operator reviews published inputs before launching a durable run", async ({ page }) => {
  await page.goto("/app/workflows");
  await page.getByRole("button", { name: "Run workflow" }).click();
  const dialog = page.getByRole("dialog", { name: /Run Launch intelligence brief/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Published version 8")).toBeVisible();
  await expect(dialog.getByLabel("Case ID Required")).toHaveValue(/CASE-/u);
  await dialog.getByLabel("Incident summary Required").fill("Critical customer recovery test");
  await dialog.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/app\/runs\/ca67b16d/u);
  await expect(page.getByRole("region", { name: "Current run status" })).toBeVisible();
});

test("@a11y operator filters runs and diagnoses live work across equivalent views", async ({
  page
}) => {
  await page.goto("/app/runs");
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  await page.getByLabel("Status").selectOption("running");
  await expect(page).toHaveURL(/status=running/u);
  await page.getByRole("link", { name: /Launch intelligence brief/u }).click();
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("region", { name: "Run execution" })).toBeVisible();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByText("run queued")).toBeVisible();
  await expect(page.getByRole("link", { name: /Workflow definition/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Run again/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Human work/u })).toBeVisible();
});

test("run surfaces use light cards and the persistent shared navigation", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop sidebar collapse behavior");
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/app/runs/ca67b16d-049d-4019-b538-1f00c23be76b");
  const elapsedCard = page.getByText("Elapsed", { exact: true }).locator("..");
  await expect(elapsedCard).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const navigation = page.locator("#workspace-navigation");
  await expect(navigation).toHaveCSS("width", "220px");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(navigation).toHaveCSS("width", "244px");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(navigation).toHaveCSS("width", "76px");
  await page.goto("/app/inbox");
  await expect(page.locator("#workspace-navigation")).toHaveCSS("width", "76px");
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
});

test("workflows and runs share the same product typography", async ({ page }) => {
  await page.goto("/app/workflows");
  const workflowTitle = await page
    .getByRole("heading", { name: "Workflows", exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily, weight: style.fontWeight };
    });
  await page.goto("/app/runs");
  const runTitle = await page
    .getByRole("heading", { name: "Runs", exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily, weight: style.fontWeight };
    });
  expect(runTitle).toEqual(workflowTitle);
  await expect(page.getByText("Total runs").locator("..").locator("strong")).toHaveCSS(
    "font-weight",
    "400"
  );
});

test("failed execution explains the stopped step and offers recovery destinations", async ({
  page
}) => {
  const runId = "ca67b16d-049d-4019-b538-1f00c23be76b";
  await page.route(`**/v1/runs/${runId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: runId,
          workflow_id: "wf_launch-campaign",
          workflow_version: 8,
          state: "failed",
          created_by: "20000000-0000-4000-8000-000000000001",
          input: { caseId: "CASE-0842" },
          created_at: "2026-07-31T00:00:00.000Z",
          started_at: "2026-07-31T00:00:00.000Z",
          finished_at: "2026-07-31T00:00:03.000Z",
          updated_at: "2026-07-31T00:00:03.000Z",
          tasks: [
            {
              id: "task-1",
              node_key: "launch_signal",
              node_kind: "trigger",
              instance_key: "root",
              queue_class: "system",
              state: "succeeded",
              state_version: "3"
            },
            {
              id: "task-2",
              node_key: "research_brief",
              node_kind: "agent",
              instance_key: "root",
              queue_class: "agent",
              state: "failed",
              state_version: "4"
            }
          ],
          events: [
            {
              sequence: "1",
              event_type: "run.running",
              actor_type: "system",
              actor_id: "system",
              payload: {},
              occurred_at: "2026-07-31T00:00:00.000Z"
            },
            {
              sequence: "2",
              event_type: "task.failed",
              actor_type: "worker",
              actor_id: "worker",
              payload: { nodeKey: "research_brief", errorCode: "STEP_EXECUTION_FAILED" },
              occurred_at: "2026-07-31T00:00:03.000Z"
            },
            {
              sequence: "3",
              event_type: "run.failed",
              actor_type: "system",
              actor_id: "system",
              payload: { from: "running", to: "failed" },
              occurred_at: "2026-07-31T00:00:03.000Z"
            }
          ]
        }
      })
    });
  });
  await page.goto(`/app/runs/${runId}`);
  await expect(page.getByText(/Execution stopped at research brief/u)).toBeVisible();
  await expect(page.getByText("STEP_EXECUTION_FAILED")).toBeVisible();
  await expect(page.getByRole("link", { name: /Inspect failure/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Version 8/u })).toBeVisible();
});

test("run room exposes safe controls and a redacted attempt inspector on mobile", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/runs/ca67b16d-049d-4019-b538-1f00c23be76b");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog", { name: "Pause this run?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm pause" }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /research brief/u }).click();
  await expect(page.getByRole("heading", { name: "research brief" })).toBeVisible();
  await expect(page.getByText(/Lead with bounded agent authority/u)).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
