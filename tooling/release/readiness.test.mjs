import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegistries, PLAN_PATH } from "../quality/plan-contract.mjs";
import { migrationMapping, releaseDecision } from "./readiness.mjs";
const registries = buildRegistries(await readFile(PLAN_PATH, "utf8"));
test("all implementation milestones are engineering committed", () => {
  const incomplete = registries.milestones.entries.filter((item) => item.status !== "COMMITTED");
  assert.deepEqual(incomplete, []);
});
test("release decision refuses GA while environment and external evidence is absent", async () => {
  const declaration = JSON.parse(
      await readFile(
        new URL("../../artifacts/verification/M38/declaration.json", import.meta.url),
        "utf8"
      )
    ),
    decision = releaseDecision({
      milestones: registries.milestones.entries,
      environmentGates: declaration.environmentGates,
      externalGates: declaration.externalGates,
      criticalRisks: []
    });
  assert.equal(decision.authorized, false);
  assert.ok(decision.blockers.incompleteEnvironment.length > 0);
  assert.ok(decision.blockers.incompleteExternal.length > 0);
});
test("precommit candidate makes no commit tag deployment or GA claim", async () => {
  const candidate = JSON.parse(
    await readFile(new URL("../../release/candidate.json", import.meta.url), "utf8")
  );
  assert.equal(candidate.claims.commit, null);
  assert.equal(candidate.claims.tag, null);
  assert.equal(candidate.claims.deployment, null);
  assert.equal(candidate.claims.generalAvailability, false);
  assert.match(candidate.candidateIndexDigest, /^sha256:[a-f0-9]{64}$/);
});
test("migration mapping is deterministic and rejects duplicate source records", () => {
  assert.deepEqual(
    migrationMapping([
      { sourceId: "a", targetId: "1", valid: true, checksum: "x" },
      { sourceId: "b", targetId: "2", valid: false, checksum: "y" }
    ]).map((item) => item.state),
    ["mapped", "attention"]
  );
  assert.throws(() =>
    migrationMapping([
      { sourceId: "a", targetId: "1", valid: true },
      { sourceId: "a", targetId: "2", valid: true }
    ])
  );
});
