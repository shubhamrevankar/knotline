import { describe, expect, it, vi } from "vitest";
import { capabilityPublicLabel, defineCapability } from "./capabilities.js";
import { defineControlFlags, resolveControlFlag } from "./flags.js";
import {
  assertPromotionManifest,
  validatePromotionManifest,
  type EnvironmentPromotionManifest
} from "./promotion.js";
import { assertReservationRequest } from "./reservations.js";
import {
  assertDeletionAllowed,
  DataLifecycleRegistry,
  type DataClassRegistration
} from "./retention.js";

const owner = { team: "platform", contact: "platform-on-call" } as const;
const runbook = "docs/operations/knotline/production-controls.md";

describe("feature and kill flags", () => {
  it("keeps literal IDs and fails closed when configuration is unavailable", () => {
    const flags = defineControlFlags([
      {
        id: "runtime.external_dispatch",
        kind: "feature",
        risk: "external_write",
        description: "Allows external dispatch.",
        defaultValue: false,
        safeValue: false,
        owner,
        runbook
      },
      {
        id: "runtime.stop_dispatch",
        kind: "kill_switch",
        risk: "external_write",
        description: "Stops dispatch.",
        defaultValue: false,
        safeValue: true,
        owner,
        runbook
      }
    ] as const);

    expect(flags["runtime.external_dispatch"].id).toBe("runtime.external_dispatch");
    expect(resolveControlFlag(flags["runtime.external_dispatch"], true, false)).toBe(false);
    expect(resolveControlFlag(flags["runtime.stop_dispatch"], undefined, false)).toBe(true);
  });

  it("rejects unsafe definitions", () => {
    expect(() =>
      defineControlFlags([
        {
          id: "runtime.dispatch",
          kind: "feature",
          risk: "expensive_work",
          description: "unsafe",
          defaultValue: true,
          safeValue: false,
          owner,
          runbook
        }
      ])
    ).toThrow("default and fail closed");
    expect(() =>
      defineControlFlags([
        {
          id: "runtime.stop",
          kind: "kill_switch",
          risk: "ordinary",
          description: "unsafe",
          defaultValue: false,
          safeValue: false,
          owner,
          runbook
        }
      ])
    ).toThrow("must engage");

    const valid = {
      id: "runtime.duplicate",
      kind: "feature" as const,
      risk: "ordinary" as const,
      description: "Valid flag.",
      defaultValue: false,
      safeValue: false,
      owner,
      runbook
    };
    expect(() => defineControlFlags([valid, valid])).toThrow("Duplicate control flag");
    expect(() => defineControlFlags([{ ...valid, id: "bad" }])).toThrow("Invalid control flag ID");
    expect(() => defineControlFlags([{ ...valid, description: "" }])).toThrow("description");
    expect(() => defineControlFlags([{ ...valid, expiresAt: "not-a-date" }])).toThrow("expiry");
  });
});

describe("usage and spend reservations", () => {
  it("validates usage and spend units before calling an atomic store", () => {
    expect(() =>
      assertReservationRequest({
        operationId: "operation_123456",
        idempotencyKey: "idem_12345678",
        workspaceId: "workspace_123456",
        kind: "spend",
        meter: "model.tokens",
        amount: 125,
        currency: "USD",
        leaseSeconds: 60
      })
    ).not.toThrow();
    expect(() =>
      assertReservationRequest({
        operationId: "operation_123456",
        idempotencyKey: "idem_12345678",
        workspaceId: "workspace_123456",
        kind: "spend",
        meter: "model.tokens",
        amount: 125,
        leaseSeconds: 60
      })
    ).toThrow("currency");
    const usage = {
      operationId: "operation_123456",
      idempotencyKey: "idem_12345678",
      workspaceId: "workspace_123456",
      kind: "usage" as const,
      meter: "model.tokens",
      amount: 125,
      leaseSeconds: 60
    };
    expect(() => assertReservationRequest({ ...usage, operationId: "bad" })).toThrow("operationId");
    expect(() => assertReservationRequest({ ...usage, meter: "bad" })).toThrow("meter");
    expect(() => assertReservationRequest({ ...usage, amount: 0 })).toThrow("amount");
    expect(() => assertReservationRequest({ ...usage, leaseSeconds: 0 })).toThrow("leaseSeconds");
    expect(() => assertReservationRequest({ ...usage, currency: "USD" })).toThrow(
      "cannot declare currency"
    );
  });
});

describe("data lifecycle registry", () => {
  const registration: DataClassRegistration = {
    id: "workflow.metadata",
    description: "Workflow metadata.",
    defaultRetentionDays: 365,
    deletionSlaHours: 24,
    supportsLegalHold: true,
    derivedDataClasses: ["search.workflow_index"],
    owner,
    runbook,
    handler: { delete: vi.fn(), verify: vi.fn() }
  };

  it("registers handlers and proves required coverage", () => {
    const registry = new DataLifecycleRegistry().register(registration);
    expect(registry.get("workflow.metadata")).toBe(registration);
    expect(registry.list()).toEqual([registration]);
    expect(() => registry.assertCoverage(["workflow.metadata", "audit.events"])).toThrow(
      "audit.events"
    );
    expect(() => registry.register(registration)).toThrow("Duplicate");
    expect(() => registry.get("missing.data")).toThrow("No data lifecycle handler");

    for (const invalid of [
      { ...registration, id: "invalid" },
      { ...registration, id: "workflow.empty", description: "" },
      { ...registration, id: "workflow.retention", defaultRetentionDays: -1 },
      { ...registration, id: "workflow.sla", deletionSlaHours: 0 },
      {
        ...registration,
        id: "workflow.derived",
        derivedDataClasses: ["workflow.derived"]
      }
    ]) {
      expect(() => new DataLifecycleRegistry().register(invalid)).toThrow();
    }
  });

  it("blocks held records and malformed requests", () => {
    expect(() =>
      assertDeletionAllowed(registration, {
        requestId: "delete_12345678",
        scope: "workspace",
        workspaceId: "workspace_123456",
        subjectId: "workspace_123456",
        requestedAt: "2026-07-31T00:00:00.000Z",
        legalHold: true,
        reason: "Customer request"
      })
    ).toThrow("legal hold");
    expect(() =>
      assertDeletionAllowed(registration, {
        requestId: "delete_12345678",
        scope: "workspace",
        workspaceId: "workspace_123456",
        subjectId: "workspace_123456",
        requestedAt: "not-a-date",
        legalHold: false,
        reason: "Customer request"
      })
    ).toThrow("requestedAt");
    expect(() =>
      assertDeletionAllowed(registration, {
        requestId: "delete_12345678",
        scope: "workspace",
        workspaceId: "workspace_123456",
        subjectId: "workspace_123456",
        requestedAt: "2026-07-31T00:00:00.000Z",
        legalHold: false,
        reason: ""
      })
    ).toThrow("reason");
  });
});

describe("capability and promotion metadata", () => {
  const manifest: EnvironmentPromotionManifest = {
    schemaVersion: 1,
    artifact: { commitSha: "a".repeat(40), sha256: "b".repeat(64) },
    targetEnvironment: "production",
    safeDefault: {
      externalWritesEnabled: false,
      expensiveWorkEnabled: false,
      featureFlags: { "runtime.external_dispatch": false }
    },
    smoke: {
      journeyId: "CJ-01",
      command: "pnpm smoke",
      syntheticTenantId: "tenant_synthetic",
      expectedResult: "healthy"
    },
    rollback: { procedure: "Rollback to the prior digest.", triggers: ["error rate > 1%"] },
    alerts: ["api-error-rate"],
    owner,
    runbook,
    externalGates: [
      {
        id: "EXT-002",
        state: "PRODUCTION_VERIFIED",
        required: true,
        evidenceReference: "artifact://external-gates/EXT-002"
      }
    ],
    publicStatus: "LIVE"
  };

  it("accepts production evidence and a complete promotion", () => {
    expect(
      defineCapability({
        id: "runtime.workflow_execution",
        status: "LIVE",
        summary: "Durable workflow execution.",
        owner,
        runbook,
        externalGates: ["EXT-002", "EXT-003"],
        evidence: {
          environment: "production",
          verifiedAt: "2026-07-31T00:00:00.000Z",
          reference: "artifact://verification/runtime"
        }
      }).status
    ).toBe("LIVE");
    expect(assertPromotionManifest(manifest)).toBe(manifest);
    expect(capabilityPublicLabel("DEMO")).toBe("DEMO");
  });

  it("rejects unsupported public claims and incomplete gates", () => {
    expect(() =>
      defineCapability({
        id: "runtime.workflow_execution",
        status: "LIVE",
        summary: "Durable workflow execution.",
        owner,
        runbook,
        externalGates: [],
        evidence: {
          environment: "staging",
          verifiedAt: "2026-07-31T00:00:00.000Z",
          reference: "artifact://verification/runtime"
        }
      })
    ).toThrow("production evidence");

    const result = validatePromotionManifest({
      ...manifest,
      externalGates: [{ id: "EXT-002", state: "BLOCKED_EXTERNAL", required: true }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("required production external gate is incomplete: EXT-002");
    expect(validatePromotionManifest(null)).toEqual({
      valid: false,
      errors: ["manifest must be an object"]
    });

    const baseCapability = {
      id: "runtime.workflow_execution",
      status: "DEMO" as const,
      summary: "Durable workflow execution.",
      owner,
      runbook,
      externalGates: [] as readonly string[]
    };
    expect(() => defineCapability({ ...baseCapability, id: "bad" })).toThrow(
      "Invalid capability ID"
    );
    expect(() => defineCapability({ ...baseCapability, summary: "" })).toThrow("summary");
    expect(() => defineCapability({ ...baseCapability, externalGates: ["BAD-1"] })).toThrow(
      "Invalid external gate"
    );
    expect(() =>
      defineCapability({ ...baseCapability, externalGates: ["EXT-002", "EXT-002"] })
    ).toThrow("Duplicate external gate");
    expect(() =>
      defineCapability({
        ...baseCapability,
        evidence: { environment: "local", verifiedAt: "bad", reference: "evidence" }
      })
    ).toThrow("timestamp");
    expect(() =>
      defineCapability({
        ...baseCapability,
        evidence: {
          environment: "local",
          verifiedAt: "2026-07-31T00:00:00.000Z",
          reference: ""
        }
      })
    ).toThrow("reference");
    expect(() => defineCapability({ ...baseCapability, status: "BETA" })).toThrow("BETA");
    expect(() =>
      defineCapability({
        ...baseCapability,
        status: "PLANNED",
        evidence: {
          environment: "local",
          verifiedAt: "2026-07-31T00:00:00.000Z",
          reference: "artifact://evidence"
        }
      })
    ).toThrow("PLANNED");
  });

  it("reports every malformed promotion control without throwing", () => {
    const result = validatePromotionManifest({
      schemaVersion: 2,
      artifact: { commitSha: "bad", sha256: "bad" },
      targetEnvironment: "invalid",
      safeDefault: {
        externalWritesEnabled: true,
        expensiveWorkEnabled: true,
        featureFlags: { invalid: "yes" }
      },
      smoke: { journeyId: "", command: "", syntheticTenantId: "", expectedResult: "" },
      rollback: { procedure: "", triggers: [] },
      alerts: [],
      owner: { team: "!", contact: "!" },
      runbook: "not-a-runbook",
      externalGates: [
        null,
        { id: "bad", state: "bad", required: "yes" },
        { id: "bad", state: "BLOCKED_EXTERNAL", required: true }
      ],
      publicStatus: "UNKNOWN"
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(15);
    expect(() => assertPromotionManifest({})).toThrow("Invalid environment-promotion manifest");
    expect(
      validatePromotionManifest({
        ...manifest,
        targetEnvironment: "development",
        publicStatus: "LIVE"
      }).errors
    ).toContain("LIVE publicStatus requires a production target");
    expect(
      validatePromotionManifest({
        ...manifest,
        externalGates: [{ id: "EXT-099", state: "NOT_APPLICABLE", required: true }]
      }).errors
    ).toContain("NOT_APPLICABLE external gate requires justification: EXT-099");
  });
});
