import { expect, test as base } from "@playwright/test";
import { demoWorkflow, demoWorkflows } from "../../apps/web/src/demo.js";

export const test = base.extend<{ consoleMessages: string[] }>({
  consoleMessages: [
    async ({ page }, use) => {
      const messages: string[] = [];

      await page.addInitScript(() => {
        if (new URL(globalThis.location.href).searchParams.has("consent")) {
          globalThis.localStorage.removeItem("knotline.consent.v1");
        } else {
          globalThis.localStorage.setItem("knotline.consent.v1", "essential");
        }
      });

      page.on("console", (message) => {
        if (message.type() === "error") messages.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

      await page.route("http://localhost:4100/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const data = pathname.includes("/teams/") ? demoWorkflows : demoWorkflow;
        await route.fulfill({
          body: JSON.stringify({ data }),
          headers: {
            "access-control-allow-credentials": "true",
            "access-control-allow-origin": "http://127.0.0.1:4173",
            "content-type": "application/json"
          },
          status: 200
        });
      });

      await use(messages);
      expect(messages, "browser console and page errors").toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
