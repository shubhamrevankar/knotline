export interface MetricEvent {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly value?: number;
  readonly dimensions?: Readonly<Record<string, string>>;
  readonly correctionOf?: string;
  readonly deleted?: boolean;
}
export interface OperationalMetricDefinition {
  readonly key: string;
  readonly sourceTypes: readonly string[];
  readonly aggregation: "count" | "sum" | "average";
  readonly lateArrivalHours: number;
  readonly version: number;
}
export function aggregateMetric(
  definition: OperationalMetricDefinition,
  events: readonly MetricEvent[],
  authorized: (event: MetricEvent) => boolean
) {
  const byId = new Map<string, MetricEvent>();
  for (const event of events) {
    if (!definition.sourceTypes.includes(event.type) || !authorized(event)) continue;
    if (event.correctionOf) byId.delete(event.correctionOf);
    if (!event.deleted) byId.set(event.id, event);
  }
  const values = [...byId.values()].map((event) => event.value ?? 1);
  const value =
    definition.aggregation === "sum"
      ? values.reduce((sum, item) => sum + item, 0)
      : definition.aggregation === "average"
        ? values.length
          ? values.reduce((sum, item) => sum + item, 0) / values.length
          : 0
        : values.length;
  return {
    key: definition.key,
    value,
    contributingIds: [...byId.keys()],
    definitionVersion: definition.version
  };
}
export function sanitizeCsvCell(value: string) {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}
export function buildCsv(rows: readonly Readonly<Record<string, unknown>>[]) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    const serialized =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
          ? `${value}`
          : value == null
            ? ""
            : JSON.stringify(value);
    const safe = sanitizeCsvCell(serialized).replaceAll('"', '""');
    return `"${safe}"`;
  };
  return [
    headers.map(cell).join(","),
    ...rows.map((row) => headers.map((header) => cell(row[header])).join(","))
  ].join("\r\n");
}
export function queryCost(input: {
  dimensions: number;
  metrics: number;
  rangeDays: number;
  estimatedRows: number;
}) {
  return (
    input.dimensions * 10 +
    input.metrics * 5 +
    Math.ceil(input.rangeDays / 7) +
    Math.ceil(input.estimatedRows / 1000)
  );
}
export function assertQueryBudget(input: Parameters<typeof queryCost>[0], limit = 500) {
  const cost = queryCost(input);
  if (cost > limit) throw new Error("ANALYTICS_QUERY_COST_EXCEEDED");
  return cost;
}
export function visibleSearchResults<
  T extends { readonly id: string; readonly fields: Readonly<Record<string, unknown>> }
>(items: readonly T[], canRead: (item: T) => boolean, visibleFields: readonly string[]) {
  return items.filter(canRead).map((item) => ({
    id: item.id,
    fields: Object.fromEntries(
      Object.entries(item.fields).filter(([key]) => visibleFields.includes(key))
    )
  }));
}
