#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 33,
  externalGates: ["EXT-001", "EXT-006", "EXT-016", "EXT-019", "EXT-020", "EXT-021", "EXT-023"],
  routes: [
    "route.accessibility",
    "route.app.feedback",
    "route.app.support",
    "route.app.support.detail",
    "route.contact",
    "route.guest",
    "route.help",
    "route.help.wildcard",
    "route.legal.acceptable-use",
    "route.legal.dpa",
    "route.legal.privacy",
    "route.legal.subprocessors",
    "route.legal.terms",
    "route.status",
    "route.trust"
  ],
  tests: [
    ["m33-global-browser", "pnpm exec playwright test tests/e2e/global-experience.spec.ts"],
    ["m33-global-unit", "pnpm --filter @knotline/operations test"],
    ["m33-global-api", "pnpm test:api"],
    ["m33-global-localization", "pnpm verify:localization"],
    ["m33-global-accessibility", "pnpm test:a11y"]
  ],
  migrations: [
    {
      id: "0030-global-experience",
      evidenceUri: "repo://packages/db/migrations/0030_global_experience.sql"
    }
  ],
  flags: [
    { id: "global-experience", evidenceUri: "repo://docs/operations/knotline/global-experience.md" }
  ],
  risk: "m33-human-device-linguistic-accessibility-and-legal-certification",
  evidenceUris: [
    "repo://apps/web/public/manifest.webmanifest",
    "repo://apps/web/public/sw.js",
    "repo://packages/operations/src/global-experience.ts",
    "repo://packages/db/src/support-repository.ts",
    "repo://tests/e2e/global-experience.spec.ts",
    "repo://docs/operations/knotline/global-experience.md"
  ],
  fixture: "install-help-guest-support-contact-and-offline-cache-classification-fixtures",
  browserTest: "tests/e2e/global-experience.spec.ts",
  persona: "global customer, guest and support requester",
  telemetry:
    "route, locale, install state, ticket state, durable receipt and normalized error only",
  capability: "experience.installable-global-guest-help-and-support",
  summary:
    "A safe installable shell, scoped guest boundary, durable support/contact flows and versioned help, status, trust, accessibility and legal surfaces are verified locally.",
  team: "experience-platform",
  runbook: "docs/operations/knotline/global-experience.md"
});
