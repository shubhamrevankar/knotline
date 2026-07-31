import { z } from "zod";

export const approvalOutcomeSchema = z.enum([
  "approve",
  "reject",
  "request_changes",
  "abstain",
  "cancel"
]);

export const approvalSelectorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userIds: z.array(z.uuid()).min(1).max(100) }),
  z.object({ type: z.literal("group"), groupIds: z.array(z.uuid()).min(1).max(100) }),
  z.object({ type: z.literal("role"), roles: z.array(z.string().min(1).max(80)).min(1).max(20) }),
  z.object({ type: z.literal("manager"), levels: z.number().int().min(1).max(10).default(1) }),
  z.object({
    type: z.literal("expression"),
    field: z.string().min(1).max(160),
    equals: z.unknown(),
    userIds: z.array(z.uuid()).min(1).max(100)
  })
]);

export const approvalPolicyStepSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
    selector: approvalSelectorSchema,
    mode: z.enum(["single", "any", "all", "quorum"]),
    quorum: z.number().int().positive().optional(),
    order: z.number().int().nonnegative(),
    allowAbstain: z.boolean().default(true)
  })
  .superRefine((step, context) => {
    if (step.mode === "quorum" && !step.quorum)
      context.addIssue({ code: "custom", message: "QUORUM_REQUIRED", path: ["quorum"] });
    if (step.mode !== "quorum" && step.quorum)
      context.addIssue({
        code: "custom",
        message: "QUORUM_ONLY_FOR_QUORUM_MODE",
        path: ["quorum"]
      });
  });

export const approvalPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.number().int().positive(),
    strategy: z.enum(["parallel", "sequential"]),
    steps: z.array(approvalPolicyStepSchema).min(1).max(50),
    allowSelfApproval: z.boolean().default(false),
    separationOfDuties: z.boolean().default(true),
    reasonRequired: z.boolean().default(true),
    autoOutcome: z.enum(["none", "reject", "cancel"]).default("none")
  })
  .superRefine((policy, context) => {
    const keys = new Set<string>();
    for (const [index, step] of policy.steps.entries()) {
      if (keys.has(step.key))
        context.addIssue({
          code: "custom",
          message: "DUPLICATE_STEP_KEY",
          path: ["steps", index, "key"]
        });
      keys.add(step.key);
    }
  });

export const approvalPacketSchema = z.object({
  title: z.string().min(1).max(200),
  proposedAction: z.string().min(1).max(2_000),
  affectedResources: z
    .array(
      z.object({ type: z.string().max(80), id: z.string().max(200), label: z.string().max(200) })
    )
    .max(100),
  diff: z.record(z.string(), z.unknown()).default({}),
  risk: z.object({
    level: z.enum(["low", "medium", "high", "critical"]),
    findings: z.array(z.string().max(500)).max(100)
  }),
  evidence: z
    .array(
      z.object({
        label: z.string().max(200),
        uri: z.string().max(2_000),
        digest: z.string().max(200).optional()
      })
    )
    .max(100),
  provenance: z.record(z.string(), z.unknown()).default({}),
  expiresAt: z.iso.datetime()
});

export const approvalDecisionSchema = z.object({
  stepKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
  outcome: approvalOutcomeSchema,
  reason: z.string().trim().max(2_000),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(16).max(160)
});

export const approvalDelegationSchema = z
  .object({
    delegateUserId: z.uuid(),
    scope: z.enum(["approval", "policy", "workspace"]),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    exclusions: z.array(z.string().max(160)).max(100).default([]),
    reason: z.string().trim().min(1).max(1_000),
    expectedVersion: z.number().int().positive()
  })
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    "INVALID_DELEGATION_INTERVAL"
  );

export const approvalRevocationSchema = z.object({
  reason: z.string().trim().min(1).max(1_000),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(16).max(160)
});

export interface ApprovalStepEvaluation {
  readonly stepKey: string;
  readonly mode: "single" | "any" | "all" | "quorum";
  readonly quorum?: number;
  readonly eligibleUserIds: readonly string[];
}

export function evaluateApproval(
  strategy: "parallel" | "sequential",
  steps: readonly ApprovalStepEvaluation[],
  decisions: readonly {
    stepKey: string;
    actorId: string;
    outcome: z.infer<typeof approvalOutcomeSchema>;
  }[]
) {
  const evaluations = steps.map((step) => {
    const current = decisions.filter((decision) => step.stepKey === decision.stepKey);
    if (current.some(({ outcome }) => outcome === "reject")) return "rejected" as const;
    if (current.some(({ outcome }) => outcome === "request_changes"))
      return "revision_requested" as const;
    const approvals = new Set(
      current.filter(({ outcome }) => outcome === "approve").map(({ actorId }) => actorId)
    ).size;
    const required =
      step.mode === "all"
        ? step.eligibleUserIds.length
        : step.mode === "quorum"
          ? (step.quorum ?? 1)
          : 1;
    return approvals >= required ? ("approved" as const) : ("pending" as const);
  });
  if (evaluations.includes("rejected")) return "rejected" as const;
  if (evaluations.includes("revision_requested")) return "revision_requested" as const;
  if (strategy === "sequential") {
    const firstPending = evaluations.indexOf("pending");
    if (
      firstPending >= 0 &&
      evaluations.slice(firstPending + 1).some((state) => state === "approved")
    )
      return "invalid_sequence" as const;
  }
  return evaluations.every((state) => state === "approved")
    ? ("approved" as const)
    : ("pending" as const);
}

export function addBusinessMinutes(
  start: Date,
  minutes: number,
  calendar: {
    readonly weekdays: readonly number[];
    readonly startHourUtc: number;
    readonly endHourUtc: number;
    readonly holidays: readonly string[];
    readonly timeZone?: string;
  }
) {
  let remaining = minutes;
  const cursor = new Date(start);
  const formatter = calendar.timeZone
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: calendar.timeZone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23"
      })
    : undefined;
  const weekdayIndex: Readonly<Record<string, number>> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  while (remaining > 0) {
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    const parts = formatter
      ? Object.fromEntries(formatter.formatToParts(cursor).map(({ type, value }) => [type, value]))
      : undefined;
    const day = parts
      ? `${parts.year}-${parts.month}-${parts.day}`
      : cursor.toISOString().slice(0, 10);
    const weekday = parts ? (weekdayIndex[parts.weekday ?? ""] ?? -1) : cursor.getUTCDay();
    const hour = parts ? Number(parts.hour) : cursor.getUTCHours();
    const inHours = hour >= calendar.startHourUtc && hour < calendar.endHourUtc;
    if (calendar.weekdays.includes(weekday) && !calendar.holidays.includes(day) && inHours)
      remaining -= 1;
  }
  return cursor;
}

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export type ApprovalPacket = z.infer<typeof approvalPacketSchema>;
