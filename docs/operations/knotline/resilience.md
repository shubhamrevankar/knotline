# Performance, resilience, backup, and recovery

Reference profiles pin topology, seeded dataset, tenant distribution, workload mix, ramp, steady duration, percentile window, correctness/error budget, and cost ceiling. Reduced deterministic profiles run in CI; full duration and scale require the named production-equivalent staging environment.

Queues use tenant-aware fair dispatch, bounded concurrency, retry budgets, and conservative behavior on Redis or provider failure. Overload must create visible bounded queues and throttling, never duplicate ownership or silently discard accepted work.

Backups include encrypted PostgreSQL PITR/WAL, versioned object data, configuration, deletion/hold streams, and isolated access. Restore runs in a separate environment and verifies checksums, schema, audit chain, malware state, deletion ledger, legal holds, residency, and application reconciliation before serving traffic.

Regional recovery requires distinct active, standby, and protection regions, authority quorum, epoch and lease fencing, a complete accepted-operation/effect manifest, deletion proof, and protection lag within the RPO. Any missing proof closes writes. Returning stale sources are quarantined and cannot merge into the new lineage.

The engineering harness validates percentile math, fairness, deterministic hash manifests, and fail-closed recovery decisions. Full load, chaos, AZ failure, restore, compound-disaster, soak, cost, RPO, and RTO results remain `NOT_DEPLOYED` until executed against the named environment with owners and evidence.
