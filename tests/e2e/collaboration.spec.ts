import { expect, test } from "./fixtures.js";

const workflowId = "wf_launch-campaign";

test("@a11y members discuss, mention, react, edit, and inspect activity safely", async ({
  page
}) => {
  await page.goto(`/app/workflows/${workflowId}`);
  await expect(page.getByRole("heading", { name: "Collaboration" })).toBeVisible();
  await expect(page.getByText("1 collaborators recently present")).toBeVisible();
  await page.getByLabel("Comment in Markdown").fill("**Review** <script>alert(1)</script>");
  await page.getByLabel("Sam Rivers").check();
  await page.getByLabel("Attachment references").fill("artifact_review_12345678");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Review", { exact: true })).toBeVisible();
  await expect(page.locator(".comment-preview script")).toHaveCount(0);
  await page.getByRole("button", { name: "Write" }).click();
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByText("1 teammates mentioned")).toBeVisible();
  await page.getByRole("button", { name: "React with thumbs_up" }).click();
  await expect(page.getByRole("button", { name: "React with thumbs_up" })).toContainText("1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Edit comment").fill("Edited review note");
  await page.getByRole("button", { name: "Save edit" }).click();
  await expect(page.getByText("Edited review note")).toBeVisible();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("Comment added", { exact: true })).toBeVisible();
});

test("mobile collaboration keeps follow, thread, and composer usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/workflows/${workflowId}`);
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await expect(page.getByLabel("Comment in Markdown")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
