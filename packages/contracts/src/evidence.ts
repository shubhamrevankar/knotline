import { z } from "zod";

export const engineeringStateSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "VERIFIED",
  "COMMITTED"
]);
export const environmentStateSchema = z.enum([
  "NOT_DEPLOYED",
  "STAGING_VERIFIED",
  "PRODUCTION_VERIFIED"
]);
export const externalEvidenceStateSchema = z.enum([
  "NOT_APPLICABLE",
  "BLOCKED_EXTERNAL",
  "SIMULATED",
  "SANDBOX_VERIFIED",
  "PRODUCTION_VERIFIED"
]);
export const evidenceDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const environmentCriterionEvidenceSchema = z
  .object({
    criterionId: z.string().regex(/^M\d{2}\.ENV\.[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    sourceBulletDigest: evidenceDigestSchema,
    requiredTerminalState: z.enum(["NOT_APPLICABLE", "STAGING_VERIFIED", "PRODUCTION_VERIFIED"]),
    actualState: environmentStateSchema.or(z.literal("NOT_APPLICABLE")),
    environmentId: z.string().min(1).nullable(),
    evidenceUris: z.array(z.string().min(1))
  })
  .strict();

export const externalGateEvidenceSchema = z
  .object({
    gateId: z.string().regex(/^EXT-\d{3}$/u),
    state: externalEvidenceStateSchema,
    requiredTerminalState: externalEvidenceStateSchema,
    accountableOwner: z.string().min(1),
    gaRequired: z.boolean(),
    reviewExpiresAt: z.iso.datetime().nullable(),
    evidenceUris: z.array(z.string().min(1))
  })
  .strict();

export const evidenceDeclarationSchema = z
  .object({
    schemaVersion: z.literal(1),
    milestone: z.string().regex(/^M\d{2}$/u),
    targetEngineeringState: z.enum(["VERIFIED", "COMMITTED"]),
    declaredEnvironmentState: environmentStateSchema,
    owners: z.array(z.string().min(1)).min(1),
    requirements: z.array(z.string().min(1)),
    activeGateRows: z.array(z.string().min(1)),
    notYetApplicable: z.array(
      z
        .object({
          row: z.string().min(1),
          activationMilestone: z.string().regex(/^M\d{2}$/u),
          reason: z.string().min(1)
        })
        .strict()
    ),
    environmentGates: z.array(environmentCriterionEvidenceSchema),
    externalGates: z.array(externalGateEvidenceSchema),
    testRuns: z.array(z.unknown()),
    manualReviews: z.array(z.unknown()),
    deployments: z.array(z.unknown()),
    migrations: z.array(z.unknown()),
    flags: z.array(z.unknown()),
    knownRisks: z.array(z.unknown()),
    evidenceUris: z.array(z.string().min(1))
  })
  .strict();

export type EvidenceDeclaration = z.infer<typeof evidenceDeclarationSchema>;
