import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateProfile, fairDispatch, recoveryDecision, recoveryManifest } from "./model.mjs";
const profiles = JSON.parse(
  await readFile(new URL("../../performance/reference-profiles.json", import.meta.url), "utf8")
);
test("reference profiles declare duration correctness and cost ceilings", () => {
  assert.equal(profiles.profiles.length, 3);
  for (const profile of profiles.profiles) {
    assert.ok(profile.id);
    assert.ok(profile.topology);
    assert.ok(profile.targets.costCeilingUsd > 0);
  }
});
test("reduced API profile uses exact percentile and error budget", () => {
  const result = evaluateProfile(
    { latencyMs: [100, 150, 200, 300, 350, 390, 400, 450, 500, 600], errors: 0, total: 10 },
    { p95Ms: 600, p99Ms: 600, errorRate: 0.001 }
  );
  assert.equal(result.pass, true);
});
test("round robin prevents noisy tenant starvation", () => {
  const result = fairDispatch({ a: [1, 2, 3, 4], b: [5], c: [6, 7] }, 6);
  assert.deepEqual(
    result.map((item) => item.tenant),
    ["a", "b", "c", "a", "c", "a"]
  );
});
test("recovery manifests are deterministic and tamper evident", () => {
  const first = recoveryManifest([
      { sequence: 2, id: "b" },
      { sequence: 1, id: "a" }
    ]),
    second = recoveryManifest([
      { sequence: 1, id: "a" },
      { sequence: 2, id: "b" }
    ]);
  assert.equal(first.root, second.root);
  assert.equal(first.entries[1].priorHash, first.entries[0].hash);
});
test("recovery closes writes on topology quorum lag deletion or effect gaps", () => {
  const safe = {
    distinctRegions: true,
    authorityQuorum: true,
    protectionLagSeconds: 100,
    rpoSeconds: 900,
    deletionLedgerVerified: true,
    effectMirrorComplete: true
  };
  assert.equal(recoveryDecision(safe).writable, true);
  for (const patch of [
    { distinctRegions: false },
    { authorityQuorum: false },
    { protectionLagSeconds: 901 },
    { deletionLedgerVerified: false },
    { effectMirrorComplete: false }
  ])
    assert.equal(recoveryDecision({ ...safe, ...patch }).writable, false);
});
