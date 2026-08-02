import { expect, test } from "./fixtures.js";

const workflowId = "wf_launch-campaign";

test("workflow library opens the complete edit, test, and publish journey", async ({ page }) => {
  await page.goto("/app/workflows");
  await page.getByRole("link", { name: "Edit workflow" }).click();
  await expect(page).toHaveURL(`/app/workflows/${workflowId}/studio`);
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();

  await page.getByText("Workflow details", { exact: true }).click();
  await page.getByLabel("Workflow description").fill("Coordinate a trusted launch review.");
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: "Capture signal", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Receive launch signal");
  await expect(page.locator(".studio-save-state")).toContainText("All changes saved", {
    timeout: 4_000
  });

  await page.getByRole("button", { name: "Review and publish" }).click();
  await page.getByRole("button", { name: "Validate draft" }).click();
  await expect(page.getByText("The saved draft is valid and publishable.")).toBeVisible();
  await page.getByRole("button", { name: "Run safe test" }).click();
  await expect(page.getByRole("status").filter({ hasText: "steps traversed" })).toContainText(
    "0 external writes"
  );
  await page.getByLabel("Release note").fill("Clarify launch intake and review ownership.");
  await page.getByRole("button", { name: "Publish immutable version" }).click();
  await expect(page.getByRole("heading", { name: "Your workflow update is live" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View published workflow" })).toBeVisible();
});

test("@a11y keyboard and pointer users can construct and edit a workflow", async ({ page }) => {
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await expect(page.getByRole("heading", { name: "Launch intelligence brief" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Workflow canvas" })).toBeVisible();
  await page.getByRole("button", { name: "Accessible outline" }).click();
  await expect(page.getByRole("heading", { name: "Accessible outline" })).toBeVisible();

  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByPlaceholder("Search step kinds").fill("integration");
  await page.getByRole("button", { name: "Integration Add to workflow" }).click();
  await expect(page.getByTestId("rf__node-integration_action_3")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Step added" })).toBeVisible();

  await page.getByTestId("rf__node-start").click();
  await page.getByLabel("Name", { exact: true }).fill("Receive signal");
  await expect(page.getByTestId("rf__node-start")).toHaveAttribute("aria-label", "Receive signal");

  await page.getByRole("heading", { name: "Launch intelligence brief" }).click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("rf__node-start_copy")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("rf__node-start_copy")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("rf__node-start_copy")).toBeVisible();

  await page.getByRole("button", { name: "Change layout" }).click();
  await page.getByRole("button", { name: "Keyboard help" }).click();
  await expect(page.getByRole("dialog", { name: "Workflow studio shortcuts" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".studio-save-state")).toContainText("Draft needs attention");
});

test("contextual editing keeps complex workflow changes fast and safe", async ({ page }) => {
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await page.getByRole("button", { name: "Capture signal", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert step after" }).click();
  await expect(page.getByRole("heading", { name: "Choose next step" })).toBeVisible();
  await expect(
    page.getByText("The new step will be connected after Capture signal.")
  ).toBeVisible();

  await page.getByPlaceholder("Search step kinds").fill("delay");
  await page.getByRole("button", { name: "Delay Add to workflow" }).click();
  await expect(page.getByRole("button", { name: "Delay 3", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Test step" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Route passed" })).toContainText(
    "0 external writes"
  );

  await page.getByPlaceholder("Find a step").fill("Editorial gate");
  await page.getByRole("button", { name: /Editorial gate.*Approval/ }).click();
  await expect(page.getByLabel("Approval policy")).toBeVisible();
});

test("mobile uses a complete outline-first editing alternative", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await page.getByRole("button", { name: "Accessible outline" }).click();
  const outline = page.getByRole("heading", { name: "Accessible outline" });
  await expect(outline).toBeVisible();
  await expect(page.getByRole("region", { name: "Workflow canvas" })).toBeVisible();
  await page
    .getByLabel("Accessible outline")
    .getByRole("button", { name: "Editorial gate", exact: true })
    .click();
  await expect(page.getByLabel("Approval policy")).toBeVisible();
  await page.getByLabel("Approval policy").fill("security_owner");
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("canvas-first editing exposes fast placement and connection actions", async ({ page }) => {
  await page.goto(`/app/workflows/${workflowId}/studio`);
  const canvas = page.getByRole("region", { name: "Workflow canvas" });
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan((page.viewportSize()?.width ?? 0) * 0.9);

  await page.getByRole("button", { name: "Capture signal", exact: true }).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Step actions" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Insert step after" })).toBeVisible();
  await page.keyboard.press("Escape");

  const edgeCount = await page.locator(".react-flow__edge").count();
  await page.locator(".react-flow__edge").first().dispatchEvent("contextmenu", {
    button: 2,
    clientX: 620,
    clientY: 460
  });
  await expect(page.getByRole("menu", { name: "Connection actions" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete connection" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount - 1);
  const closeInspector = page.getByRole("button", { name: "Close inspector" });
  if (await closeInspector.isVisible()) await closeInspector.click();

  if ((page.viewportSize()?.width ?? 0) <= 760) {
    await page.getByRole("button", { name: "Add step" }).click();
  } else {
    await canvas.dblclick({
      position: {
        x: Math.min(520, (canvasBox?.width ?? 600) / 2),
        y: Math.min(420, (canvasBox?.height ?? 600) / 2)
      }
    });
  }
  await expect(page.getByRole("heading", { name: "Add steps" })).toBeVisible();
});

test("studio contains page scrolling and makes executable step behavior editable", async ({ page }) => {
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await page.mouse.move(4, 360);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByPlaceholder("Search step kinds").fill("transform");
  await page.getByRole("button", { name: "Transform Add to workflow" }).click();

  await expect(page.getByRole("heading", { name: "Edit step" })).toBeVisible();
  await expect(page.getByText("Executable behavior")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What this step does" })).toBeVisible();
  await expect(page.getByText("The field mapping below is the transformation logic.")).toBeVisible();
  await expect(page.getByText("No transformation rules are configured yet.")).toBeVisible();
  await page
    .getByLabel("Output field mapping (JSON)")
    .fill('{\n  "caseId": "${input.caseId}",\n  "summary": "${input.summary}"\n}');
  await page.getByLabel("Logic revision").fill("customer-case.v3");
  await expect(page.getByText("This is only a revision label for auditing.")).toBeVisible();

  await page.getByText("Advanced configuration", { exact: true }).click();
  await expect(page.getByLabel("Complete configuration (JSON)")).toBeEditable();

  if ((page.viewportSize()?.width ?? 0) > 760) {
    await page.getByRole("button", { name: "Close inspector" }).click();
    await page.getByRole("button", { name: "Fit workflow" }).click();
    await page.getByTestId("rf__node-start").click();
    await page.keyboard.down("Control");
    await page.getByTestId("rf__node-review").click();
    await page.getByTestId("rf__node-transform_3").click();
    await page.keyboard.up("Control");
    await expect(page.getByRole("button", { name: "Distribute selection" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Group selection" })).toBeVisible();
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);
});

test("optimistic concurrency never silently overwrites another editor", async ({ page }) => {
  await page.route(`http://localhost:4100/v1/workflows/${workflowId}/draft`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 412,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "DRAFT_CONFLICT", message: "Draft changed" } })
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/app/workflows/${workflowId}/studio`);
  await page.getByRole("button", { name: "Capture signal", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Conflicting edit");
  await expect(page.locator(".studio-save-state")).toContainText(
    "Another editor changed this draft",
    { timeout: 4_000 }
  );
  await expect(page.getByRole("button", { name: "Reload server draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Encrypted recovery available" })).toBeVisible();
});
