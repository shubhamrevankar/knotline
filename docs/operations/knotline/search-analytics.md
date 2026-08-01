# Search and operational analytics

Search indexes only fields already authorized for the workspace resource. Query results are filtered by tenant RLS and must be materialized through the current resource authorization before display; deletion or access-epoch invalidation removes the document within the revocation SLO. Rebuilds use a new generation and promote only after completeness checks.

Saved views store versioned filters, sort, columns, grouping, owner, visibility, and revision. Unknown fields render as broken-field warnings rather than silently changing meaning. Deletion fails while a report references the view.

Metrics are curated, versioned definitions over immutable domain events. Each definition declares source types, exclusions, dimensions, time-zone rules, late-arrival window, correction behavior, and owner. Buckets retain source watermark and contributing count. A dashboard value is valid only when its drill-through under the same authorization scope reconciles exactly. Partial or stale data must remain labelled; demo workspaces are excluded by default.

Query cost limits bound dimensions, measures, time range, estimated rows, timeout, and export size. CSV exports quote every cell and prefix spreadsheet formula triggers. Export objects are short-lived and authorization is rechecked at creation and download. Scheduled delivery uses the notification controls and repeats authorization at render and send time.

Alerts cover indexing lag, revocation lag, aggregation watermark lag, correction backlog, query rejection rate, cache inconsistency, export failures, and scheduled-report lateness. During search degradation, return an honest unavailable state without cached restricted titles. During analytics degradation, preserve the last verified watermark and mark data stale; never manufacture a trend.
