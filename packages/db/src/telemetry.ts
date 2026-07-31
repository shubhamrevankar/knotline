import { defineMetric } from "@knotline/operations";

export const DATABASE_METRICS = [
  defineMetric({
    name: "knotline_database_query_duration_ms",
    kind: "histogram",
    description: "Database query duration grouped by safe fingerprint and outcome.",
    labels: ["fingerprint", "outcome"]
  }),
  defineMetric({
    name: "knotline_database_pool_connections",
    kind: "gauge",
    description: "Database pool connections by state.",
    labels: ["state"]
  }),
  defineMetric({
    name: "knotline_outbox_pending_events",
    kind: "gauge",
    description: "Unpublished durable outbox event count.",
    labels: ["environment"]
  }),
  defineMetric({
    name: "knotline_database_errors_total",
    kind: "counter",
    description: "Database errors grouped by safe error class.",
    labels: ["error_class"]
  })
] as const;

export const STAGING_DATABASE_ALERTS = [
  { id: "database-pool-saturation", threshold: 0.8, windowMinutes: 5, severity: "warning" },
  { id: "database-query-p95-ms", threshold: 250, windowMinutes: 10, severity: "warning" },
  { id: "database-connection-errors", threshold: 5, windowMinutes: 5, severity: "critical" },
  {
    id: "outbox-oldest-unpublished-seconds",
    threshold: 120,
    windowMinutes: 5,
    severity: "critical"
  }
] as const;
