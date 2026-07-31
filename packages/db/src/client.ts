import { createHash } from "node:crypto";
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

export interface SafeQueryObservation {
  readonly fingerprint: string;
  readonly durationMs: number;
  readonly rowCount: number | null;
  readonly outcome: "success" | "failure";
}

export type QueryObserver = (observation: SafeQueryObservation) => void;

export function queryFingerprint(sql: string): string {
  const normalized = sql
    .replace(/'(?:''|[^'])*'/gu, "?")
    .replace(/\b\d+(?:\.\d+)?\b/gu, "?")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
  return `sha256:${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

export function createPool(databaseUrl: string, overrides: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: databaseUrl,
    application_name: "knotline-api",
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...overrides
  });
}

export async function observedQuery<Row extends QueryResultRow>(
  query: () => Promise<QueryResult<Row>>,
  sql: string,
  observer?: QueryObserver
): Promise<QueryResult<Row>> {
  const startedAt = performance.now();
  try {
    const result = await query();
    observer?.({
      fingerprint: queryFingerprint(sql),
      durationMs: performance.now() - startedAt,
      rowCount: result.rowCount,
      outcome: "success"
    });
    return result;
  } catch (error) {
    observer?.({
      fingerprint: queryFingerprint(sql),
      durationMs: performance.now() - startedAt,
      rowCount: null,
      outcome: "failure"
    });
    throw error;
  }
}
