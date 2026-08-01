import { describe, expect, it } from "vitest";
import {
  aggregateMetric,
  assertQueryBudget,
  buildCsv,
  queryCost,
  sanitizeCsvCell,
  visibleSearchResults
} from "./analytics.js";
describe("authorized operational analytics", () => {
  it("deduplicates corrections and reconciles drill-through", () => {
    const result = aggregateMetric(
      {
        key: "runs",
        sourceTypes: ["run.done"],
        aggregation: "sum",
        lateArrivalHours: 48,
        version: 1
      },
      [
        { id: "a", type: "run.done", occurredAt: "2026-01-01T00:00:00Z", value: 2 },
        { id: "a", type: "run.done", occurredAt: "2026-01-01T00:00:00Z", value: 2 },
        { id: "b", type: "run.done", occurredAt: "2026-01-01T00:00:00Z", value: 3 },
        {
          id: "c",
          correctionOf: "b",
          type: "run.done",
          occurredAt: "2026-01-02T00:00:00Z",
          value: 4
        }
      ],
      () => true
    );
    expect(result.value).toBe(6);
    expect(result.contributingIds).toEqual(["a", "c"]);
  });
  it("filters objects before returning even a title", () =>
    expect(
      visibleSearchResults(
        [
          { id: "1", fields: { title: "visible", secret: "x" } },
          { id: "2", fields: { title: "hidden" } }
        ],
        (item) => item.id === "1",
        ["title"]
      )
    ).toEqual([{ id: "1", fields: { title: "visible" } }]));
  it("neutralizes spreadsheet formulas", () =>
    expect(buildCsv([{ name: "=IMPORTXML(x)", value: 2 }])).toContain("'=IMPORTXML"));
  it("rejects abusive query cost", () =>
    expect(() =>
      assertQueryBudget({ dimensions: 10, metrics: 20, rangeDays: 365, estimatedRows: 1_000_000 })
    ).toThrow("ANALYTICS_QUERY_COST_EXCEEDED"));
  it("covers empty averages, deletion, authorization, and accepted query cost", () => {
    expect(
      aggregateMetric(
        {
          key: "latency",
          sourceTypes: ["done"],
          aggregation: "average",
          lateArrivalHours: 1,
          version: 1
        },
        [
          { id: "hidden", type: "done", occurredAt: "2026-01-01T00:00:00Z", value: 10 },
          { id: "deleted", type: "done", occurredAt: "2026-01-01T00:00:00Z", deleted: true }
        ],
        () => false
      ).value
    ).toBe(0);
    expect(queryCost({ dimensions: 1, metrics: 1, rangeDays: 7, estimatedRows: 1 })).toBe(17);
    expect(assertQueryBudget({ dimensions: 1, metrics: 1, rangeDays: 7, estimatedRows: 1 })).toBe(
      17
    );
  });
  it("serializes primitives, objects, nulls, and all formula prefixes safely", () => {
    const csv = buildCsv([{ a: null, b: true, c: 4n, d: { safe: true }, e: "@cmd" }]);
    expect(csv).toContain('{""safe"":true}');
    expect(sanitizeCsvCell("+SUM(1)")).toBe("'+SUM(1)");
    expect(sanitizeCsvCell("plain")).toBe("plain");
  });
  it("computes count and nonempty average while ignoring unrelated sources", () => {
    const events = [
      { id: "a", type: "done", occurredAt: "2026-01-01T00:00:00Z", value: 2 },
      { id: "b", type: "done", occurredAt: "2026-01-01T00:00:00Z", value: 4 },
      { id: "x", type: "other", occurredAt: "2026-01-01T00:00:00Z" }
    ];
    expect(
      aggregateMetric(
        {
          key: "count",
          sourceTypes: ["done"],
          aggregation: "count",
          lateArrivalHours: 1,
          version: 1
        },
        events,
        () => true
      ).value
    ).toBe(2);
    expect(
      aggregateMetric(
        {
          key: "average",
          sourceTypes: ["done"],
          aggregation: "average",
          lateArrivalHours: 1,
          version: 1
        },
        events,
        () => true
      ).value
    ).toBe(3);
  });
});
