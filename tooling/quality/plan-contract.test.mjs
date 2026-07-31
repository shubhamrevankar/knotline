import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildRegistries,
  canonicalJson,
  makeOperationId,
  PLAN_PATH,
  run,
  validateCodeRoutes
} from "./plan-contract.mjs";

const plan = await readFile(PLAN_PATH, "utf8");

test("locks the authoritative plan inventory and deterministic output", () => {
  const first = buildRegistries(plan);
  const second = buildRegistries(plan.replaceAll("\r\n", "\n"));
  assert.equal(first.requirements.entries.length, 199);
  assert.equal(first.milestones.entries.length, 39);
  assert.equal(first.routes.entries.length, 105);
  assert.equal(first.journeys.entries.filter(({ id }) => !id.includes(".")).length, 24);
  assert.equal(first.journeys.entries.filter(({ id }) => id.includes(".")).length, 15);
  assert.equal(first.externalGates.entries.length, 25);
  assert.equal(first.api.entries.length, 443);
  assert.equal(
    first.routes.entries.find(({ path }) => path === "/product/integrations").routeClass,
    "public_async"
  );
  assert.deepEqual(
    first.journeys.entries.find(({ id }) => id === "CJ-14.PROVIDERS").ownerMilestones,
    ["M23", "M24", "M25", "M26"]
  );
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test("normalizes API operation IDs without dropping uppercase or camel-case characters", () => {
  assert.equal(
    makeOperationId("GET", "/v1/workflows/:workflowId/Groups"),
    "get-v1-workflows-by-workflow-id-groups"
  );
  const operationIds = buildRegistries(plan).api.entries.map(({ id }) => id);
  assert.equal(new Set(operationIds).size, operationIds.length);
  assert(operationIds.includes("get-v1-workflows-by-workflow-id"));
  const collision = plan.replace(
    "GET    /v1/me\n",
    "GET    /v1/me\nGET    /v1/Groups\nGET    /v1/groups\n"
  );
  assert.throws(() => buildRegistries(collision), /Duplicate normalized API operation ID/);
});

test("rejects duplicate and unowned requirements", () => {
  const duplicate = plan.replace(
    "| ID-002 | Users can sign in with Google OIDC |",
    "| ID-001 | Users can sign in with Google OIDC |"
  );
  assert.throws(() => buildRegistries(duplicate), /Duplicate requirement ID-001/);

  const unowned = plan.replace("| OP-001–OP-002 | M01 |", "| OP-001 | M01 |");
  assert.throws(() => buildRegistries(unowned), /Missing requirement owner OP-002/);
});

test("rejects dependency mismatch and dependency cycles", () => {
  const mismatch = plan.replace(
    "| M01 | M00 | Engineering contract |",
    "| M01 | M02 | Engineering contract |"
  );
  assert.throws(() => buildRegistries(mismatch), /Dependency mismatch for M01/);

  const cycle = plan
    .replace("| M01 | M00 | Engineering contract |", "| M01 | M02 | Engineering contract |")
    .replace(
      "**Depends on:** M00\\\n**Required commit:** `chore: establish the verified",
      "**Depends on:** M02\\\n**Required commit:** `chore: establish the verified"
    );
  assert.throws(() => buildRegistries(cycle), /Cyclic milestone dependency/);
});

test("rejects orphaned canonical journeys", () => {
  const orphaned = plan.replace(/^\| `CJ-24` Recover region .*$/m, "");
  assert.throws(
    () => buildRegistries(orphaned),
    /(?:Missing canonical journey CJ-24|Orphan journey branch CJ-24\.PRODUCTION)/
  );
});

test("rejects code routes absent from the API contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "knotline-route-contract-"));
  await mkdir(join(root, "apps/api/src"), { recursive: true });
  await mkdir(join(root, "tooling/routes"), { recursive: true });
  await writeFile(join(root, "apps/api/src/app.ts"), 'app.get("/v1/unknown", handler);\n');
  await writeFile(
    join(root, "tooling/routes/legacy-m00.json"),
    '{"schemaVersion":1,"entries":[]}\n'
  );
  await assert.rejects(
    validateCodeRoutes(buildRegistries(plan).api.entries, root),
    /Code route absent from API inventory/
  );
});

test("generated registries have no drift", async () => {
  await run("check");
});
