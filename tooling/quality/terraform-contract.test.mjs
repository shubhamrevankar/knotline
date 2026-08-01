import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
const module = await readFile(
    new URL("../../infra/terraform/modules/platform/main.tf", import.meta.url),
    "utf8"
  ),
  staging = await readFile(
    new URL("../../infra/terraform/environments/staging/main.tf", import.meta.url),
    "utf8"
  );
test("infrastructure pins provider, artifact and distinct protection region", () => {
  assert.match(module, /required_version/);
  assert.match(module, /artifact_digest/);
  assert.match(module, /protection_region!=var\.active_region/);
  assert.match(module, /enable_key_rotation=true/);
  assert.match(module, /prevent_destroy=true/);
  assert.match(staging, /active_region="us-east-1"/);
  assert.match(staging, /standby_region="us-west-2"/);
  assert.match(staging, /protection_region="eu-west-1"/);
});
test("object storage blocks public access and enables versioning", () => {
  assert.match(module, /block_public_acls=true/);
  assert.match(module, /restrict_public_buckets=true/);
  assert.match(module, /status="Enabled"/);
  assert.match(module, /sse_algorithm="aws:kms"/);
});
