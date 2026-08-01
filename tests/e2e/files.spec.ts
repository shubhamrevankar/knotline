import { expect, test } from "./fixtures.js";

const fileId = "a1900000-0000-4000-8000-000000000001";

test("@a11y uploads a knowledge file and exposes truthful scan and processing state", async ({
  page
}) => {
  let uploaded = false;
  await page.route("**/v1/workspaces/*/files", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: uploaded
          ? [
              {
                id: fileId,
                filename: "incident-handbook.pdf",
                purpose: "knowledge_source",
                state: "processing",
                classification: "internal",
                current_version: 1,
                media_type: "application/pdf",
                size_bytes: 12,
                created_at: "2026-07-31T00:00:00.000Z"
              }
            ]
          : []
      })
    })
  );
  await page.route("**/v1/workspaces/*/file-uploads", async (route) => {
    uploaded = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          upload_id: "a1900000-0000-4000-8000-000000000002",
          file_id: fileId,
          state: "initiated"
        }
      })
    });
  });
  await page.goto("/app/knowledge/sources");
  await expect(page.getByRole("heading", { name: "Files and sources" })).toBeVisible();
  await expect(page.getByText("No files yet")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "incident-handbook.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("safe fixture")
  });
  await expect(page.getByRole("heading", { name: "incident-handbook.pdf" })).toBeVisible();
  await expect(page.getByText("processing", { exact: true })).toBeVisible();
});

test("document detail gates preview/download and creates an immutable deletion result on mobile", async ({
  page
}) => {
  await page.route(`**/v1/files/${fileId}`, (route) => {
    if (route.request().method() === "DELETE")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: { downstreamEventId: "a1900000-0000-4000-8000-000000000009" }
        })
      });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: fileId,
          filename: "incident-handbook.pdf",
          state: "ready",
          classification: "internal",
          current_version: 2,
          versions: [{ version: 2, checksum: `sha256:${"a".repeat(64)}` }],
          processing_jobs: [{ state: "partial", warnings: ["OCR_LOW_CONFIDENCE"] }]
        }
      })
    });
  });
  await page.route(`**/v1/files/${fileId}/preview`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { artifact: { kind: "preview_pdf", sanitized: true } } })
    })
  );
  await page.route(`**/v1/files/${fileId}/download-tokens`, (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: { token: ["one", "time", "token"].join("-"), expiresAt: "2026-07-31T00:01:00.000Z" }
      })
    })
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/app/knowledge/documents/${fileId}`);
  await expect(page.getByText("OCR_LOW_CONFIDENCE")).toBeVisible();
  await page.getByRole("button", { name: "Open preview" }).click();
  await expect(page.getByText("preview_pdf")).toBeVisible();
  await page.getByRole("button", { name: "Create secure download" }).click();
  await page.getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByText("deleted", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
