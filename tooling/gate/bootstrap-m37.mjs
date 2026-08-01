#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 37,
  externalGates: ["EXT-002", "EXT-003", "EXT-006", "EXT-021", "EXT-022"],
  routes: ["route.ops.releases"],
  tests: [
    ["m37-delivery-browser", "pnpm exec playwright test tests/e2e/releases.spec.ts"],
    [
      "m37-delivery-contract",
      "node --test tooling/delivery/model.test.mjs tooling/quality/terraform-contract.test.mjs"
    ],
    ["m37-delivery-build", "pnpm verify:reproducible-build"],
    ["m37-delivery-security", "pnpm verify:secrets"]
  ],
  migrations: [],
  flags: [{ id: "delivery", evidenceUri: "repo://docs/operations/knotline/delivery.md" }],
  risk: "m37-production-account-temporal-domain-email-and-promotion-proof",
  evidenceUris: [
    "repo://infra/terraform/environments/production/main.tf",
    "repo://infra/terraform/bootstrap/main.tf",
    "repo://.github/workflows/deploy.yml",
    "repo://tooling/delivery/model.mjs",
    "repo://tests/e2e/releases.spec.ts",
    "repo://docs/operations/knotline/delivery.md"
  ],
  fixture: "signed-digest-module-parity-migration-canary-and-evidence-invalidation-fixtures",
  browserTest: "tests/e2e/releases.spec.ts",
  persona: "release engineer and production approver",
  telemetry:
    "artifact digest, module digest, migration phase, health gate, decision and rollback target only",
  capability: "delivery.reproducible-environments-promotion-and-rollback",
  summary:
    "Pinned production infrastructure, OIDC-only protected delivery, build-once records, migration decisions, health gates and rollback UX are verified locally.",
  team: "delivery-platform",
  runbook: "docs/operations/knotline/delivery.md"
});
