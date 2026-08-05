import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { PostgresAnalyticsRepository } from "./analytics-repository.js";

const context = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  principalId: "20000000-0000-4000-8000-000000000001",
  requestId: "request-1"
};

const poolWithMetrics = (
  bucketRows: readonly Record<string, unknown>[],
  liveRows: readonly Record<string, unknown>[]
) => {
  const query = vi.fn((sql: string) => {
    if (sql.includes("FROM metric_buckets")) return Promise.resolve({ rows: bucketRows });
    if (sql.includes("WITH recent_runs")) return Promise.resolve({ rows: liveRows });
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn();
  return {
    pool: { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool,
    query,
    release
  };
};

describe("PostgresAnalyticsRepository.dashboard", () => {
  it("returns live operational metrics when no aggregate buckets exist", async () => {
    const live = {
      metricKey: "workflow.success_rate",
      value: 75,
      contributingCount: 4,
      freshThrough: new Date("2026-08-05T10:00:00.000Z"),
      dimensions: { source: "live_operational" }
    };
    const { pool, query, release } = poolWithMetrics([], [live]);

    const result = await new PostgresAnalyticsRepository(pool).dashboard(context);

    expect(result).toMatchObject({
      metrics: [live],
      freshThrough: "2026-08-05T10:00:00.000Z",
      partial: false,
      demoExcluded: true
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("WITH recent_runs"))).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it("uses live values for derived metrics and retains other bucketed metrics", async () => {
    const duplicateBucket = {
      metricKey: "workflow.success_rate",
      value: 10,
      contributingCount: 2,
      freshThrough: new Date("2026-08-04T10:00:00.000Z"),
      dimensions: { source: "metric_bucket" }
    };
    const retainedBucket = {
      metricKey: "hours.returned",
      value: 12,
      contributingCount: 8,
      freshThrough: new Date("2026-08-05T09:00:00.000Z"),
      dimensions: { source: "metric_bucket" }
    };
    const live = {
      metricKey: "workflow.success_rate",
      value: 80,
      contributingCount: 5,
      freshThrough: new Date("2026-08-05T11:00:00.000Z"),
      dimensions: { source: "live_operational" }
    };
    const { pool } = poolWithMetrics([duplicateBucket, retainedBucket], [live]);

    const result = await new PostgresAnalyticsRepository(pool).dashboard(context);

    expect(result.metrics).toEqual([live, retainedBucket]);
    expect(result.freshThrough).toBe("2026-08-05T11:00:00.000Z");
  });
});
