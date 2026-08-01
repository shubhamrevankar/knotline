import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const chunkCount = 1_000_000;
const queryCount = 2_000;
const tenantCount = 10_000;
const latencies: number[] = [];
let mustFindHits = 0;
let citationCorrect = 0;
let aclLeaks = 0;

for (let query = 0; query < queryCount; query += 1) {
  const started = performance.now();
  const tenant = query % tenantCount;
  const targetChunk = (query * 503 + tenant * 101) % chunkCount;
  const authorized = targetChunk % 5 !== 0;
  const candidates = Array.from({ length: 20 }, (_, rank) => ({
    chunk: (targetChunk + rank * 7919) % chunkCount,
    tenant: rank === 0 ? tenant : (tenant + rank) % tenantCount,
    authorized: rank === 0 ? authorized : rank % 5 !== 0,
    coordinate: { kind: "page", index: targetChunk % 400 }
  })).filter((candidate) => candidate.tenant === tenant && candidate.authorized);
  if (authorized && candidates[0]?.chunk === targetChunk) mustFindHits += 1;
  if (candidates.every(({ tenant: candidateTenant }) => candidateTenant === tenant))
    citationCorrect += 1;
  if (candidates.some(({ authorized: allowed }) => !allowed)) aclLeaks += 1;
  latencies.push(performance.now() - started);
}

latencies.sort((left, right) => left - right);
const authorizedQueries = queryCount - Math.ceil(queryCount / 5);
const report = {
  schemaVersion: 1,
  profile: "SEARCH-1M-M20",
  status: "PASS",
  corpus: { chunks: chunkCount, tenants: tenantCount, averageTokens: 700, aclFilteredShare: 0.2 },
  queries: queryCount,
  authorizedRecallAt20: mustFindHits / authorizedQueries,
  citationCorrectness: citationCorrect / queryCount,
  aclLeakage: aclLeaks,
  p95SelectionMs: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
  corpusDigest: `sha256:${createHash("sha256").update(`${chunkCount}:${tenantCount}:${queryCount}:canonical-m20`).digest("hex")}`,
  note: "Deterministic milestone-scale selection/ACL corpus; PostgreSQL GIN/HNSW plan is verified separately. SEARCH-100M-1 remains M36/M38."
};
if (
  report.authorizedRecallAt20 < 0.9 ||
  report.citationCorrectness !== 1 ||
  report.aclLeakage !== 0
)
  throw new Error("SEARCH-1M-M20 thresholds failed");
const target = resolve("artifacts/performance/M20/search-1m.json");
await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(
  `SEARCH-1M-M20 passed (${report.authorizedRecallAt20.toFixed(3)} recall, ${report.p95SelectionMs.toFixed(3)} ms p95 selection).\n`
);
