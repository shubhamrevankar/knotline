import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import { flatConfigs as importFlatConfigs } from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import promise from "eslint-plugin-promise";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import globals from "globals";
import tseslint from "typescript-eslint";

import { localizationPlugin } from "./tooling/localization/eslint-plugin.mjs";

const typescriptFiles = ["**/*.{ts,tsx}"];
const reactFiles = ["apps/web/**/*.{ts,tsx}"];
const userVisibleCopyFiles = ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/index.tsx"];

export const policyConfig = tseslint.config(
  eslint.configs.recommended,
  importFlatConfigs.recommended,
  { ...importFlatConfigs.typescript, files: typescriptFiles },
  promise.configs["flat/recommended"],
  security.configs.recommended,
  {
    rules: {
      ...Object.fromEntries(
        Object.keys(security.configs.recommended.rules).map((ruleName) => [ruleName, "error"])
      ),
      "security/detect-child-process": "off",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
      "security/detect-object-injection": "off",
      "security/detect-unsafe-regex": "off"
    }
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        project: ["./apps/*/tsconfig.json", "./packages/*/tsconfig.json", "./tsconfig.tools.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["apps/*/tsconfig.json", "packages/*/tsconfig.json"]
        }
      }
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(security.configs.recommended.rules).map((ruleName) => [ruleName, "error"])
      ),
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" }
      ],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "import-x/no-unresolved": ["error", { commonjs: true, caseSensitive: true }],
      "import-x/first": "error",
      "promise/always-return": "off",
      "security/detect-child-process": "off",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
      "security/detect-object-injection": "off",
      "security/detect-unsafe-regex": "off"
    }
  },
  {
    plugins: { knotline: localizationPlugin },
    rules: { "knotline/no-hardcoded-user-visible-string": "off" }
  },
  {
    files: userVisibleCopyFiles,
    ignores: ["**/*.test.{ts,tsx}", "**/__lint_fixtures__/**"],
    rules: { "knotline/no-hardcoded-user-visible-string": "error" }
  },
  {
    files: reactFiles,
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser }
    },
    plugins: {
      ...react.configs.flat.recommended.plugins,
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      "react/jsx-uses-react": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off"
    },
    settings: {
      react: { version: "detect" }
    }
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  prettier
);

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "artifacts/**",
      "contracts/generated/**",
      "packages/contracts/src/routes.generated.ts",
      "docs/**",
      "playwright-report/**",
      "apps/web/src/__lint_fixtures__/**",
      "test-results/**"
    ]
  },
  ...policyConfig
);
