import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
const model = JSON.parse(
    await readFile(new URL("../../security/threat-models/product.json", import.meta.url), "utf8")
  ),
  controls = JSON.parse(
    await readFile(new URL("../../security/control-matrix.json", import.meta.url), "utf8")
  );
test("every threat has owner-reviewed mitigations tests and residual risk", () => {
  assert.ok(model.owner);
  assert.ok(model.reviewCadenceDays <= 90);
  for (const threat of model.threats) {
    assert.match(threat.id, /^TM-\d{3}$/);
    assert.ok(threat.mitigations.length >= 2);
    assert.ok(threat.tests.length >= 1);
    assert.ok(["low", "medium", "high", "critical"].includes(threat.residualRisk));
  }
});
test("security claims preserve external blockers", () => {
  for (const control of controls.controls) {
    assert.ok(control.owner);
    if (control.status === "blocked_external") {
      assert.match(control.externalGate, /^EXT-\d{3}$/);
      assert.deepEqual(control.evidence, []);
    }
  }
  assert.match(controls.claimsPolicy, /no certification is claimed/i);
});
