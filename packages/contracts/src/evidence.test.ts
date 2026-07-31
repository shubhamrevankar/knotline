import { describe, expect, it } from "vitest";

import {
  evidenceDeclarationSchema,
  environmentCriterionEvidenceSchema,
  externalGateEvidenceSchema
} from "./evidence.js";

const declaration = {
  schemaVersion: 1 as const,
  milestone: "M01",
  targetEngineeringState: "COMMITTED" as const,
  declaredEnvironmentState: "NOT_DEPLOYED" as const,
  owners: ["shurevan"],
  requirements: ["OP-001", "OP-002"],
  activeGateRows: ["format"],
  notYetApplicable: [
    { row: "browser e2e", activationMilestone: "M02", reason: "Activates with M02." }
  ],
  environmentGates: [],
  externalGates: [],
  testRuns: [],
  manualReviews: [],
  deployments: [],
  migrations: [],
  flags: [],
  knownRisks: [],
  evidenceUris: ["repo://contracts/generated/registry-index.json"]
};

describe("evidence transport contracts", () => {
  it("accepts a strict pre-commit declaration and rejects a source-commit field", () => {
    expect(evidenceDeclarationSchema.parse(declaration).milestone).toBe("M01");
    expect(() =>
      evidenceDeclarationSchema.parse({ ...declaration, sourceCommit: "a".repeat(40) })
    ).toThrow();
  });

  it("requires source-bound environment criteria and complete external gate states", () => {
    expect(() =>
      environmentCriterionEvidenceSchema.parse({
        criterionId: "M34.ENV.staging-smoke",
        sourceBulletDigest: `sha256:${"0".repeat(64)}`,
        requiredTerminalState: "STAGING_VERIFIED",
        actualState: "NOT_DEPLOYED",
        environmentId: null,
        evidenceUris: []
      })
    ).not.toThrow();

    expect(() =>
      externalGateEvidenceSchema.parse({
        gateId: "EXT-004",
        state: "PRODUCTION_VERIFIED",
        requiredTerminalState: "PRODUCTION_VERIFIED",
        accountableOwner: "",
        gaRequired: true,
        reviewExpiresAt: "not-an-instant",
        evidenceUris: []
      })
    ).toThrow();
  });
});
