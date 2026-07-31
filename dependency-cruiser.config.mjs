/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true }
    },
    {
      name: "web-must-not-import-other-apps",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^apps/(?!web/)" }
    },
    {
      name: "api-must-not-import-other-apps",
      severity: "error",
      from: { path: "^apps/api/" },
      to: { path: "^apps/(?!api/)" }
    },
    {
      name: "packages-must-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" }
    },
    {
      name: "no-unresolvable-imports",
      severity: "error",
      from: {},
      to: { couldNotResolve: true }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(coverage|dist|node_modules|test-results|playwright-report)/",
    includeOnly: "^(apps|packages|scripts|tooling)/",
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      mainFields: ["module", "main"],
      conditionNames: ["types", "import", "node", "default"]
    }
  }
};
