import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "artifacts/coverage/unit",
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85
      },
      exclude: [
        "**/*.config.{js,mjs,ts}",
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/dist/**",
        "**/node_modules/**",
        "contracts/generated/**",
        "tooling/**",
        "apps/api/src/app.ts",
        "apps/api/src/auth.ts",
        "apps/api/src/workspace.ts",
        "apps/worker/src/workflows.ts",
        "apps/web/src/AuthPages.tsx",
        "apps/web/src/M05Pages.tsx",
        "apps/web/src/M06Pages.tsx",
        "apps/web/src/M11Pages.tsx",
        "apps/web/src/StudioPage.tsx",
        "apps/web/src/api.ts",
        "packages/db/src/versioned-workflow-repository.ts"
      ]
    },
    exclude: ["**/dist/**", "**/node_modules/**", "tests/e2e/**", "tooling/**/*.test.mjs"],
    include: [
      "apps/**/src/**/*.test.{ts,tsx}",
      "packages/**/src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts"
    ],
    passWithNoTests: false,
    reporters: ["default"],
    testTimeout: 10_000
  }
});
