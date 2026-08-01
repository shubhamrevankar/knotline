#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 32,
  externalGates: ["EXT-015", "EXT-022"],
  routes: [
    "route.app.settings.identity",
    "route.app.settings.policies",
    "route.app.settings.security"
  ],
  tests: [
    ["m32-enterprise-browser", "pnpm exec playwright test tests/e2e/enterprise-identity.spec.ts"],
    ["m32-enterprise-unit", "pnpm --filter @knotline/operations test"],
    ["m32-enterprise-api", "pnpm test:api"],
    ["m32-enterprise-migrations", "pnpm verify:migrations"]
  ],
  migrations: [
    {
      id: "0029-enterprise-identity",
      evidenceUri: "repo://packages/db/migrations/0029_enterprise_identity.sql"
    }
  ],
  flags: [
    {
      id: "enterprise-identity",
      evidenceUri: "repo://docs/operations/knotline/enterprise-identity.md"
    }
  ],
  risk: "m32-real-idp-scim-and-region-certification",
  evidenceUris: [
    "repo://packages/operations/src/enterprise-identity.ts",
    "repo://packages/db/src/enterprise-repository.ts",
    "repo://packages/db/migrations/0029_enterprise_identity.sql",
    "repo://tests/e2e/enterprise-identity.spec.ts",
    "repo://docs/operations/knotline/enterprise-identity.md"
  ],
  fixture: "sso-binding-domain-scim-policy-and-region-migration-fixtures",
  browserTest: "tests/e2e/enterprise-identity.spec.ts",
  persona: "enterprise identity and security administrator",
  telemetry:
    "connection state, policy decision, provisioning receipt, region phase and normalized error only",
  capability: "enterprise.identity-provisioning-policy-and-residency",
  summary:
    "Safe-test enterprise identity, DNS domain control, one-time SCIM credentials, staged policy and explicit region migration are verified locally.",
  team: "enterprise-platform",
  runbook: "docs/operations/knotline/enterprise-identity.md"
});
