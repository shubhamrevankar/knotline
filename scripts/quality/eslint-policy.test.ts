import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { policyConfig } from "../../eslint.config.mjs";

const fixturePath = fileURLToPath(
  new URL("../../apps/web/src/__lint_fixtures__/invalid.tsx", import.meta.url)
);
const copyFixturePath = fileURLToPath(
  new URL("../../apps/web/src/__lint_fixtures__/hardcoded-copy.ts", import.meta.url)
);

describe("ESLint policy", () => {
  it("executes every configured lint rule family", async () => {
    const runner = new ESLint({
      overrideConfig: policyConfig,
      overrideConfigFile: true
    });
    const [result] = await runner.lintFiles([fixturePath]);
    const ruleIds = new Set(result?.messages.map((message) => message.ruleId));

    expect(ruleIds).toContain("@typescript-eslint/no-explicit-any");
    expect(ruleIds).toContain("security/detect-eval-with-expression");
    expect(ruleIds).toContain("jsx-a11y/alt-text");
    expect(ruleIds).toContain("promise/catch-or-return");
    expect(ruleIds).toContain("react/jsx-key");
    expect(ruleIds).toContain("import-x/first");
    expect(result?.errorCount).toBeGreaterThanOrEqual(6);
  }, 20_000);

  it("can activate the M02 user-visible hardcoded-copy policy", async () => {
    const runner = new ESLint({
      overrideConfig: [
        ...policyConfig,
        {
          files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
          rules: { "knotline/no-hardcoded-user-visible-string": "error" }
        }
      ],
      overrideConfigFile: true
    });
    const [result] = await runner.lintFiles([fixturePath]);

    expect(
      result?.messages.some(
        (message) => message.ruleId === "knotline/no-hardcoded-user-visible-string"
      )
    ).toBe(true);
  });

  it("covers validation, notification, export, and public copy call sites", async () => {
    const runner = new ESLint({
      overrideConfig: [
        ...policyConfig,
        {
          files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
          rules: { "knotline/no-hardcoded-user-visible-string": "error" }
        }
      ],
      overrideConfigFile: true
    });
    const [result] = await runner.lintFiles([copyFixturePath]);
    const violations = result?.messages.filter(
      (message) => message.ruleId === "knotline/no-hardcoded-user-visible-string"
    );
    expect(violations).toHaveLength(4);
  });
});
