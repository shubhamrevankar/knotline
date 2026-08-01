import { createHash } from "node:crypto";

import {
  evaluationCaseSchema,
  evaluationResultSchema,
  releaseGateSchema,
  type EvaluationCase,
  type EvaluationResult
} from "@knotline/contracts";

export interface EvaluationObservation {
  readonly output: unknown;
  readonly toolTrajectory?: readonly string[];
  readonly citations?: readonly string[];
  readonly safetyBlocked?: boolean;
  readonly latencyMs?: number;
  readonly costDecimal?: string;
}

export interface GraderDefinition {
  readonly kind: EvaluationResult["grader"];
  readonly version: string;
  readonly configuration: Readonly<Record<string, unknown>>;
}

export interface ModelJudge {
  judge(input: {
    readonly rubric: string;
    readonly candidate: unknown;
    readonly expected: unknown;
    readonly untrustedCase: unknown;
  }): Promise<{ score: number; reasonCode: string }>;
}

export class EvaluationRunner {
  constructor(private readonly judge?: ModelJudge) {}

  async grade(
    caseInput: unknown,
    observation: EvaluationObservation,
    grader: GraderDefinition
  ): Promise<EvaluationResult> {
    const evalCase = evaluationCaseSchema.parse(caseInput);
    const result = await this.#evaluate(evalCase, observation, grader);
    return evaluationResultSchema.parse({ caseKey: evalCase.stableKey, ...result });
  }

  async #evaluate(
    evalCase: EvaluationCase,
    observation: EvaluationObservation,
    grader: GraderDefinition
  ): Promise<Omit<EvaluationResult, "caseKey">> {
    const result = (passed: boolean, reasonCode: string, score = passed ? 1 : 0) => ({
      passed,
      score,
      grader: grader.kind,
      reasonCode,
      details: {}
    });
    if (grader.kind === "exact_match" || grader.kind === "deterministic")
      return result(canonical(observation.output) === canonical(evalCase.expected), "EXACT_MATCH");
    if (grader.kind === "schema")
      return result(matchesSchema(observation.output, grader.configuration.schema), "SCHEMA_VALID");
    if (grader.kind === "rule") {
      const path = stringOr(grader.configuration.path, "");
      return result(
        readPath(observation.output, path) === grader.configuration.equals,
        "RULE_MATCH"
      );
    }
    if (grader.kind === "tool_trajectory")
      return result(
        canonical(observation.toolTrajectory ?? []) ===
          canonical(grader.configuration.expected ?? []),
        "TOOL_TRAJECTORY"
      );
    if (grader.kind === "citation") {
      const minimum = numberOr(grader.configuration.minimum, 1);
      return result((observation.citations?.length ?? 0) >= minimum, "CITATION_COVERAGE");
    }
    if (grader.kind === "safety")
      return result(
        observation.safetyBlocked === Boolean(grader.configuration.expectedBlocked),
        "SAFETY_POLICY"
      );
    if (grader.kind === "latency")
      return result(
        (observation.latencyMs ?? Number.POSITIVE_INFINITY) <=
          numberOr(grader.configuration.maxMs, 0),
        "LATENCY_LIMIT"
      );
    if (grader.kind === "cost")
      return result(
        decimalUnits(observation.costDecimal ?? "999999") <=
          decimalUnits(stringOr(grader.configuration.maxDecimal, "0")),
        "COST_LIMIT"
      );
    if (grader.kind === "model" || grader.kind === "pairwise") {
      if (!this.judge) throw new Error("MODEL_JUDGE_UNAVAILABLE");
      const judged = await this.judge.judge({
        rubric: stringOr(grader.configuration.rubric, "Score correctness."),
        candidate: observation.output,
        expected: evalCase.expected,
        untrustedCase: { input: evalCase.input, references: evalCase.references }
      });
      const score = Math.max(0, Math.min(1, judged.score));
      return result(score >= numberOr(grader.configuration.minimum, 0.8), judged.reasonCode, score);
    }
    return result(false, "GRADER_UNSUPPORTED");
  }
}

export interface ComparisonSummary {
  readonly baselineScore: number;
  readonly candidateScore: number;
  readonly delta: number;
  readonly sampleSize: number;
  readonly confidence95: readonly [number, number];
  readonly lowSample: boolean;
  readonly regressions: readonly string[];
}

export function compareResults(
  baseline: readonly EvaluationResult[],
  candidate: readonly EvaluationResult[],
  minimumSampleSize = 30
): ComparisonSummary {
  const baselineByCase = new Map(baseline.map((result) => [result.caseKey, result]));
  const paired = candidate.filter((result) => baselineByCase.has(result.caseKey));
  const baselineScore = mean(paired.map((result) => baselineByCase.get(result.caseKey)!.score));
  const candidateScore = mean(paired.map((result) => result.score));
  const delta = candidateScore - baselineScore;
  const standardError = paired.length
    ? Math.sqrt(Math.max(0, candidateScore * (1 - candidateScore)) / paired.length)
    : 0;
  return {
    baselineScore,
    candidateScore,
    delta,
    sampleSize: paired.length,
    confidence95: [delta - 1.96 * standardError, delta + 1.96 * standardError],
    lowSample: paired.length < minimumSampleSize,
    regressions: paired
      .filter((result) => result.score < baselineByCase.get(result.caseKey)!.score)
      .map((result) => result.caseKey)
  };
}

export function evaluateReleaseGate(
  gateInput: unknown,
  comparison: ComparisonSummary,
  completedSuiteIds: readonly string[],
  safetyFailures: number
) {
  const gate = releaseGateSchema.parse(gateInput);
  const reasons: string[] = [];
  if (gate.requiredSuiteIds.some((id) => !completedSuiteIds.includes(id)))
    reasons.push("REQUIRED_SUITE_MISSING");
  if (comparison.sampleSize < gate.minimumSampleSize) reasons.push("SAMPLE_TOO_SMALL");
  if (comparison.candidateScore < gate.minimumScore) reasons.push("MINIMUM_SCORE_MISSED");
  if (comparison.delta < -gate.maximumRegression) reasons.push("REGRESSION_LIMIT_EXCEEDED");
  if (gate.blockSafetyFailures && safetyFailures > 0) reasons.push("SAFETY_FAILURE");
  return { passed: reasons.length === 0, reasons };
}

export function stableCanaryAllocation(subjectId: string, releaseId: string, percentage: number) {
  const bucket =
    Number.parseInt(
      createHash("sha256").update(`${releaseId}:${subjectId}`).digest("hex").slice(0, 8),
      16
    ) % 10_000;
  return bucket < Math.max(0, Math.min(100, percentage)) * 100 ? "candidate" : "stable";
}

export function blindPairOrder(
  caseKey: string,
  reviewRound: string
): readonly ["A", "B"] | readonly ["B", "A"] {
  return createHash("sha256").update(`${reviewRound}:${caseKey}`).digest()[0]! % 2 === 0
    ? ["A", "B"]
    : ["B", "A"];
}

export function parseEvaluationCases(format: "csv" | "jsonl", source: string) {
  const rows =
    format === "jsonl"
      ? source
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as unknown)
      : parseCsv(source);
  return rows.map((row, index) => {
    try {
      return evaluationCaseSchema.parse(row);
    } catch (error) {
      throw new Error(`EVALUATION_IMPORT_INVALID_ROW:${index + 1}`, { cause: error });
    }
  });
}

export interface ScheduledEvaluation {
  readonly scheduleId: string;
  readonly dueAt: Date;
  readonly attempt: number;
  readonly estimatedCostDecimal: string;
}

export function planScheduledEvaluations(
  candidates: readonly ScheduledEvaluation[],
  now: Date,
  budgetDecimal: string,
  completedIdempotencyKeys: ReadonlySet<string>
) {
  let remaining = decimalUnits(budgetDecimal);
  const selected: Array<ScheduledEvaluation & { idempotencyKey: string }> = [];
  for (const candidate of [...candidates].sort(
    (left, right) => left.dueAt.getTime() - right.dueAt.getTime()
  )) {
    if (candidate.dueAt > now) continue;
    const idempotencyKey = `${candidate.scheduleId}:${candidate.dueAt.toISOString()}`;
    if (completedIdempotencyKeys.has(idempotencyKey)) continue;
    const cost = decimalUnits(candidate.estimatedCostDecimal);
    if (cost > remaining) continue;
    remaining -= cost;
    selected.push({ ...candidate, idempotencyKey });
  }
  return { selected, remainingBudgetDecimal: formatDecimalUnits(remaining) };
}

const canonical = (value: unknown): string => JSON.stringify(normalize(value));
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)])
    );
  return value;
};
const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const numberOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const stringOr = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;
const decimalUnits = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(12, "0").slice(0, 12)}`);
};
const formatDecimalUnits = (value: bigint) => {
  const raw = value.toString().padStart(13, "0");
  return `${raw.slice(0, -12)}.${raw.slice(-12)}`;
};
const parseCsv = (source: string): unknown[] => {
  const lines = source.split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    );
    return {
      stableKey: record.stableKey,
      input: parseJsonCell(record.input ?? "null"),
      expected: parseJsonCell(record.expected ?? "null"),
      references: parseJsonCell(record.references || "[]"),
      tags: parseJsonCell(record.tags || "[]"),
      difficulty: record.difficulty,
      risk: record.risk,
      sensitive: record.sensitive === "true",
      ...(record.consentReference ? { consentReference: record.consentReference } : {})
    };
  });
};
const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += character;
  }
  if (quoted) throw new Error("EVALUATION_IMPORT_UNTERMINATED_QUOTE");
  values.push(current);
  return values;
};
const parseJsonCell = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("EVALUATION_IMPORT_INVALID_JSON", { cause: error });
  }
};
const readPath = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value
    );
const matchesSchema = (value: unknown, schema: unknown) => {
  if (!schema || typeof schema !== "object") return false;
  const definition = schema as Record<string, unknown>;
  if (definition.type === "object")
    return (
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (!Array.isArray(definition.required) ||
        definition.required.every((key) => typeof key === "string" && key in (value as object)))
    );
  if (definition.type === "string") return typeof value === "string";
  if (definition.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (definition.type === "boolean") return typeof value === "boolean";
  if (definition.type === "array") return Array.isArray(value);
  return true;
};
