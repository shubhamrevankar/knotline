#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 35,
  externalGates: ["EXT-016", "EXT-017", "EXT-018", "EXT-019", "EXT-022", "EXT-024"],
  routes: ["route.ops.security"],
  tests: [
    ["m35-security-browser", "pnpm exec playwright test tests/e2e/security-assurance.spec.ts"],
    ["m35-security-contract", "node --test tooling/quality/security-assurance.test.mjs"],
    [
      "m35-security-scanners",
      "pnpm verify:secrets && pnpm verify:dependencies && pnpm verify:licenses"
    ],
    ["m35-security-build", "pnpm verify:reproducible-build"]
  ],
  migrations: [],
  flags: [
    {
      id: "security-assurance",
      evidenceUri: "repo://docs/operations/knotline/security-assurance.md"
    }
  ],
  risk: "m35-independent-penetration-legal-access-review-and-tabletop",
  evidenceUris: [
    "repo://security/threat-models/product.json",
    "repo://security/control-matrix.json",
    "repo://tooling/quality/security-assurance.test.mjs",
    "repo://tests/e2e/security-assurance.spec.ts",
    "repo://docs/operations/knotline/security-assurance.md"
  ],
  fixture: "threat-control-sbom-provenance-secret-and-claim-fixtures",
  browserTest: "tests/e2e/security-assurance.spec.ts",
  persona: "security engineer, auditor and system owner",
  telemetry: "control ID, scanner class, artifact digest, decision and normalized error only",
  capability: "security.product-supply-chain-and-assurance",
  summary:
    "Threat and control models, CI security lanes, artifact assurance, honest trust claims and operator evidence UX are verified locally.",
  team: "security-platform",
  runbook: "docs/operations/knotline/security-assurance.md"
});
