import { expect, test } from "./fixtures.js";

const agentId = "a1400000-0000-4000-8000-000000000001";
const comparisonId = "a1800000-0000-4000-8000-000000000010";

test("@a11y creates an evaluation dataset, inspects regressions, and promotes a passing canary", async ({
  page
}) => {
  let created = false;
  await page.route("**/v1/workspaces/*/eval-datasets", async (route) => {
    if (route.request().method() === "POST") {
      created = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "a1800000-0000-4000-8000-000000000020" } })
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: created
          ? [
              {
                id: "a1800000-0000-4000-8000-000000000020",
                name: "Release golden suite",
                description: "Held-out agent behavior cases",
                state: "draft",
                case_count: 0
              }
            ]
          : [
              {
                id: "a1800000-0000-4000-8000-000000000021",
                name: "Incident adversarial suite",
                description: "Prompt injection and tool misuse",
                state: "active",
                current_version: 3,
                case_count: 100
              }
            ]
      })
    });
  });
  await page.route("**/v1/eval-comparisons**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: comparisonId,
            agent_id: agentId,
            baseline_version: 1,
            candidate_version: 2,
            summary: {
              baselineScore: 0.9,
              candidateScore: 0.94,
              delta: 0.04,
              sampleSize: 100,
              confidence95: [0.01, 0.07],
              lowSample: false,
              regressions: ["adversarial-exfiltration"]
            },
            gate_decision: { passed: true, reasons: [] }
          }
        ]
      })
    })
  );
  await page.route("**/v1/agents/*/versions/*/releases", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "a1800000-0000-4000-8000-000000000030" } })
    })
  );
  await page.goto(`/app/agents/${agentId}/evals`);
  await expect(page.getByRole("heading", { name: "Evaluations and releases" })).toBeVisible();
  await expect(page.getByText("94.0%")).toBeVisible();
  await expect(page.getByText("adversarial-exfiltration")).toBeVisible();
  await page.getByLabel("Dataset name").fill("Release golden suite");
  await page.getByRole("button", { name: "Create dataset" }).click();
  await expect(page.getByText("Evaluation dataset created.")).toBeVisible();
  await page.getByRole("button", { name: "Start 10% canary" }).click();
  await expect(page.getByText(/Canary release .* created/u)).toBeVisible();
});

test("agent activity exposes monitoring uncertainty and immutable rollback on mobile", async ({
  page
}) => {
  await page.route("**/v1/agents/*/versions/*/releases", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "a1800000-0000-4000-8000-000000000031" } })
    })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/app/agents/${agentId}/activity`);
  await expect(page.getByRole("heading", { name: "Agent activity" })).toBeVisible();
  await expect(page.getByText("LOW SAMPLE — UNCERTAIN")).toBeVisible();
  await page.getByRole("button", { name: "Roll back instantly" }).click();
  await expect(page.getByText(/Rollback record .* created/u)).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
