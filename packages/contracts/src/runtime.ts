import { z } from "zod";

import { type WorkflowDefinition, type WorkflowDefinitionEdge } from "./workflow-definition.js";

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
  readonly incoming: readonly WorkflowDefinitionEdge[];
  readonly outgoing: readonly WorkflowDefinitionEdge[];
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
    incoming: definition.edges
      .filter(({ target }) => target === node.key)
      .toSorted((left, right) => left.key.localeCompare(right.key)),
    outgoing: definition.edges
      .filter(({ source }) => source === node.key)
      .toSorted((left, right) => left.key.localeCompare(right.key)),
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
              : node.kind === "approval"
                ? 1_800_000
                : 60_000)
        )
      )
    ),
    configuration: node.configuration
  }));
}

export interface RuntimeExpressionScope {
  readonly input: Readonly<Record<string, unknown>>;
  readonly nodes: Readonly<Record<string, { readonly output: unknown }>>;
  readonly sourceOutput?: unknown;
  readonly iteration?: number;
}

type ExpressionToken =
  | { readonly kind: "operator"; readonly value: string }
  | { readonly kind: "literal"; readonly value: unknown }
  | { readonly kind: "reference"; readonly value: string };

const tokenizeExpression = (expression: string): readonly ExpressionToken[] => {
  const source = expression.trim();
  const tokens: ExpressionToken[] = [];
  const matcher =
    /\s*(\|\||&&|==|!=|<=|>=|<|>|!|\(|\)|true\b|false\b|null\b|-?\d+(?:\.\d+)?|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\$\{(?:input|nodes)\.[a-zA-Z0-9_.-]+\}|[a-zA-Z_][a-zA-Z0-9_.-]*)/gy;
  let offset = 0;
  while (offset < source.length) {
    matcher.lastIndex = offset;
    const match = matcher.exec(source);
    if (!match || match.index !== offset) throw new Error("RUNTIME_EXPRESSION_INVALID");
    const value = match[1]!;
    offset = matcher.lastIndex;
    if (["||", "&&", "==", "!=", "<=", ">=", "<", ">", "!", "(", ")"].includes(value))
      tokens.push({ kind: "operator", value });
    else if (value === "true" || value === "false")
      tokens.push({ kind: "literal", value: value === "true" });
    else if (value === "null") tokens.push({ kind: "literal", value: null });
    else if (/^-?\d/u.test(value)) tokens.push({ kind: "literal", value: Number(value) });
    else if (value.startsWith("'") || value.startsWith('"'))
      tokens.push({
        kind: "literal",
        value: value.slice(1, -1).replace(/\\(['"\\])/gu, "$1")
      });
    else tokens.push({ kind: "reference", value });
  }
  return tokens;
};

const nestedValue = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const findNestedKey = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  if (!Array.isArray(value) && key in value) return (value as Record<string, unknown>)[key];
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findNestedKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
};

const normalizedDecisionValue = (reference: string, value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (/(?:severity|risk)$/iu.test(reference)) {
    if (/\bcritical\b|\bsev[- ]?1\b/iu.test(normalized)) return "critical";
    if (/\bhigh\b|\bsev[- ]?2\b/iu.test(normalized)) return "high";
    if (/\bmedium\b|\bsev[- ]?3\b/iu.test(normalized)) return "medium";
    if (/\blow\b|\bsev[- ]?4\b/iu.test(normalized)) return "low";
  }
  return normalized;
};

const resolveExpressionReference = (reference: string, scope: RuntimeExpressionScope): unknown => {
  const unwrapped = reference.startsWith("${") ? reference.slice(2, -1) : reference;
  if (unwrapped === "iteration") return scope.iteration ?? 0;
  const segments = unwrapped.split(".");
  let value: unknown;
  if (segments[0] === "input") value = nestedValue(scope.input, segments.slice(1));
  else if (segments[0] === "nodes") value = nestedValue(scope.nodes, segments.slice(1));
  else {
    value = nestedValue(scope.sourceOutput, segments);
    if (value === undefined && segments.length === 1)
      for (const node of Object.values(scope.nodes).toReversed()) {
        value = findNestedKey(node.output, segments[0]!);
        if (value !== undefined) break;
      }
    if (value === undefined) value = nestedValue(scope.input, segments);
  }
  return normalizedDecisionValue(unwrapped, value);
};

const expressionEquals = (left: unknown, right: unknown) =>
  typeof left === "string" && typeof right === "string"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;

/** Evaluates the deliberately small workflow condition language without dynamic code execution. */
export function evaluateRuntimeExpression(
  expression: string,
  scope: RuntimeExpressionScope
): boolean {
  try {
    const tokens = tokenizeExpression(expression);
    let cursor = 0;
    const peek = () => tokens[cursor];
    const take = () => tokens[cursor++];
    const operand = (): unknown => {
      const token = take();
      if (!token) throw new Error("RUNTIME_EXPRESSION_INCOMPLETE");
      if (token.kind === "literal") return token.value;
      if (token.kind === "reference") return resolveExpressionReference(token.value, scope);
      if (token.value === "(") {
        const value = disjunction();
        if (take()?.value !== ")") throw new Error("RUNTIME_EXPRESSION_PARENTHESIS");
        return value;
      }
      if (token.value === "!") return !operand();
      throw new Error("RUNTIME_EXPRESSION_OPERAND");
    };
    const comparison = (): boolean => {
      const left = operand();
      const operator = peek();
      if (
        operator?.kind !== "operator" ||
        !["==", "!=", "<", "<=", ">", ">="].includes(operator.value)
      )
        return Boolean(left);
      take();
      const right = operand();
      if (operator.value === "==") return expressionEquals(left, right);
      if (operator.value === "!=") return !expressionEquals(left, right);
      if (operator.value === "<") return Number(left) < Number(right);
      if (operator.value === "<=") return Number(left) <= Number(right);
      if (operator.value === ">") return Number(left) > Number(right);
      return Number(left) >= Number(right);
    };
    const conjunction = (): boolean => {
      let value = comparison();
      while (peek()?.value === "&&") {
        take();
        const right = comparison();
        value = value && right;
      }
      return value;
    };
    const disjunction = (): boolean => {
      let value = conjunction();
      while (peek()?.value === "||") {
        take();
        const right = conjunction();
        value = value || right;
      }
      return value;
    };
    const result = disjunction();
    return cursor === tokens.length && result;
  } catch {
    return false;
  }
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
