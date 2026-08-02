import { z } from "zod";

import { type WorkflowDefinition } from "./workflow-definition.js";

export const runStateSchema = z.enum([
  "queued",
  "running",
  "paused",
  "cancelling",
  "cancelled",
  "succeeded",
  "failed",
  "policy_stopped"
]);
export const taskStateSchema = z.enum([
  "pending",
  "ready",
  "running",
  "waiting",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
  "skipped"
]);
export type RunState = z.infer<typeof runStateSchema>;
export type TaskState = z.infer<typeof taskStateSchema>;

const runTransitions: Readonly<Record<RunState, readonly RunState[]>> = {
  queued: ["running", "cancelled", "policy_stopped", "failed"],
  running: ["paused", "cancelling", "succeeded", "failed", "policy_stopped"],
  paused: ["running", "cancelling", "failed", "policy_stopped"],
  cancelling: ["cancelled", "failed"],
  cancelled: [],
  succeeded: [],
  failed: [],
  policy_stopped: []
};
const taskTransitions: Readonly<Record<TaskState, readonly TaskState[]>> = {
  pending: ["ready", "cancelled", "skipped"],
  ready: ["running", "cancelled", "skipped"],
  running: ["waiting", "retry_wait", "succeeded", "failed", "cancelled", "uncertain"],
  waiting: ["running", "cancelled", "failed"],
  retry_wait: ["ready", "cancelled", "failed"],
  succeeded: [],
  failed: [],
  cancelled: [],
  uncertain: [],
  skipped: []
};

export function assertRunTransition(from: RunState, to: RunState): void {
  if (!runTransitions[from].includes(to)) throw new Error(`INVALID_RUN_TRANSITION:${from}:${to}`);
}
export function assertTaskTransition(from: TaskState, to: TaskState): void {
  if (!taskTransitions[from].includes(to)) throw new Error(`INVALID_TASK_TRANSITION:${from}:${to}`);
}

export interface RuntimePlanNode {
  readonly key: string;
  readonly kind: WorkflowDefinition["nodes"][number]["kind"];
  readonly dependencies: readonly string[];
  readonly successors: readonly string[];
  readonly queue: "system" | "human" | "agent" | "connector";
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly configuration: Readonly<Record<string, unknown>>;
}

export function compileRuntimePlan(definition: WorkflowDefinition): readonly RuntimePlanNode[] {
  const incoming = new Map(definition.nodes.map(({ key }) => [key, [] as string[]]));
  const outgoing = new Map(definition.nodes.map(({ key }) => [key, [] as string[]]));
  for (const edge of definition.edges) {
    incoming.get(edge.target)?.push(edge.source);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queueFor = (kind: RuntimePlanNode["kind"]): RuntimePlanNode["queue"] =>
    kind === "human" || kind === "approval"
      ? "human"
      : kind === "agent"
        ? "agent"
        : kind === "integration_action"
          ? "connector"
          : "system";
  return definition.nodes.map((node) => ({
    key: node.key,
    kind: node.kind,
    dependencies: [...(incoming.get(node.key) ?? [])].sort(),
    successors: [...(outgoing.get(node.key) ?? [])].sort(),
    queue: queueFor(node.kind),
    maxAttempts: Math.max(1, Math.min(10, Number(node.configuration.maxAttempts ?? 3))),
    timeoutMs: Math.max(
      1_000,
      Math.min(
        86_400_000,
        Number(
          node.configuration.timeoutMs ??
            (typeof node.configuration.dueInMinutes === "number"
              ? node.configuration.dueInMinutes * 60_000
              : 60_000)
        )
      )
    ),
    configuration: node.configuration
  }));
}

export const runIntentSchema = z
  .object({
    type: z.enum(["pause", "resume", "cancel", "retry", "fork"]),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().min(8).max(128)
  })
  .strict();

export const startRunSchema = z
  .object({
    input: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: z.string().min(8).max(128),
    maximumQuantity: z.string().regex(/^\d+$/u).default("1000"),
    policyVersion: z.string().min(1).max(80).default("default-v1")
  })
  .strict();

export function addDecimalUnits(left: string, right: string): string {
  if (!/^\d+$/u.test(left) || !/^\d+$/u.test(right)) throw new Error("INVALID_DECIMAL_UNITS");
  return (BigInt(left) + BigInt(right)).toString();
}

export function canReserveUnits(
  limit: string,
  committed: string,
  reserved: string,
  request: string
) {
  return BigInt(committed) + BigInt(reserved) + BigInt(request) <= BigInt(limit);
}
