export type MetricKind = "counter" | "gauge" | "histogram";

export interface MetricDefinition<Name extends string = string> {
  readonly name: Name;
  readonly kind: MetricKind;
  readonly description: string;
  readonly labels: readonly string[];
}

const METRIC_NAME = /^knotline_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const LABEL_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const HIGH_CARDINALITY_LABELS = new Set([
  "request_id",
  "trace_id",
  "span_id",
  "user_id",
  "workspace_id",
  "workflow_id",
  "run_id",
  "task_id",
  "email",
  "url"
]);

export function defineMetric<const Name extends string>(
  definition: MetricDefinition<Name>
): MetricDefinition<Name> {
  if (!METRIC_NAME.test(definition.name)) {
    throw new Error(`Metric name must use knotline_snake_case: ${definition.name}`);
  }
  if (definition.kind === "counter" && !definition.name.endsWith("_total")) {
    throw new Error(`Counter metric must end in _total: ${definition.name}`);
  }
  const seen = new Set<string>();
  for (const label of definition.labels) {
    if (!LABEL_NAME.test(label)) throw new Error(`Invalid metric label: ${label}`);
    if (HIGH_CARDINALITY_LABELS.has(label)) {
      throw new Error(`High-cardinality metric label is prohibited: ${label}`);
    }
    if (seen.has(label)) throw new Error(`Duplicate metric label: ${label}`);
    seen.add(label);
  }
  if (!definition.description.trim()) throw new Error("Metric description is required");
  return Object.freeze({ ...definition, labels: Object.freeze([...definition.labels]) });
}
