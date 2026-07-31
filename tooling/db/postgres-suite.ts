import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { buildApp } from "../../apps/api/src/app.js";
import type { AuthService } from "../../apps/api/src/auth.js";
import {
  createPool,
  generateRealisticData,
  loadMigrations,
  migrate,
  migrationCompatibility,
  PostgresWorkflowRepository,
  SEED,
  seedSyntheticTenants,
  withTenantTransaction
} from "../../packages/db/src/index.js";

const IMAGE =
  "pgvector/pgvector:0.8.1-pg17-trixie@sha256:137f044b0efe3d57f39b972b9b53641b1f2045b99d879e298bbf514a25787dcf";
const mode = process.argv[2] ?? "integration";
const containerName = `knotline-m03-${mode}-${process.pid}-${Date.now()}`;
const password = "local-only-m03-test-password";
const principalA = SEED.userA;
const principalB = SEED.userB;
const contextA = { workspaceId: SEED.workspaceA, principalId: principalA, requestId: "m03-a" };
const contextB = { workspaceId: SEED.workspaceB, principalId: principalB, requestId: "m03-b" };
type DatabasePool = ReturnType<typeof createPool>;

function docker(...args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function startPostgres(): Promise<{ adminUrl: string; pool: DatabasePool }> {
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_DB=knotline",
    "--env",
    "POSTGRES_USER=knotline_local",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    IMAGE
  );
  let port = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const output = docker("port", containerName, "5432/tcp");
    port = output.match(/:(\d+)$/u)?.[1] ?? "";
    if (port) break;
    await delay(250);
  }
  assert(port, "Docker did not publish the PostgreSQL port");
  const adminUrl = `postgresql://knotline_local:${password}@127.0.0.1:${port}/knotline`;
  const pool = createPool(adminUrl, { max: 20 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return { adminUrl, pool };
    } catch {
      await delay(250);
    }
  }
  throw new Error("PostgreSQL did not become ready");
}

async function expectRejected(operation: () => Promise<unknown>, fragment: string): Promise<void> {
  try {
    await operation();
    throw new Error(`Expected rejection containing ${fragment}`);
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(fragment),
      `Unexpected error: ${String(error)}`
    );
  }
}

async function migrationSuite(
  adminUrl: string,
  pool: DatabasePool
): Promise<Record<string, unknown>> {
  const first = await migrate(adminUrl);
  const second = await migrate(adminUrl);
  assert(
    first.length === (await loadMigrations()).length,
    "Empty-database migration did not apply every migration exactly once"
  );
  assert(second.length === 0, "Migration rerun was not idempotent");
  const checksum = await pool.query<{ checksum: string }>(
    "SELECT checksum FROM knotline_schema_migrations WHERE id = '0001_tenant_foundation.sql'"
  );
  const expectedChecksum = checksum.rows[0]?.checksum;
  assert(expectedChecksum, "Migration checksum was not recorded");
  await pool.query(
    "UPDATE knotline_schema_migrations SET checksum = $1 WHERE id = '0001_tenant_foundation.sql'",
    ["0".repeat(64)]
  );
  assert(
    (await migrationCompatibility(pool)).compatible === false,
    "Readiness accepted an incompatible migration checksum"
  );
  await pool.query(
    "UPDATE knotline_schema_migrations SET checksum = $1 WHERE id = '0001_tenant_foundation.sql'",
    [expectedChecksum]
  );
  await seedSyntheticTenants(pool);
  const generated = await generateRealisticData(pool, 10_000);
  const startedAt = performance.now();
  const lockClient = await pool.connect();
  try {
    await lockClient.query("BEGIN");
    await lockClient.query("SET LOCAL lock_timeout = '2s'");
    await lockClient.query("ALTER TABLE workflows ADD COLUMN migration_probe integer");
  } finally {
    await lockClient.query("ROLLBACK");
    lockClient.release();
  }
  const lockDurationMs = performance.now() - startedAt;
  assert(lockDurationMs < 2_000, `Expand migration lock exceeded budget: ${lockDurationMs}`);

  const failureClient = await pool.connect();
  try {
    await failureClient.query("BEGIN");
    await failureClient.query("CREATE TABLE migration_failure_probe(id integer)");
    await expectRejected(() => failureClient.query("THIS IS NOT VALID SQL"), "syntax error");
  } finally {
    await failureClient.query("ROLLBACK");
    failureClient.release();
  }
  const probe = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.migration_failure_probe') IS NOT NULL AS exists"
  );
  assert(probe.rows[0]?.exists === false, "Failed migration left partial schema state");

  const plan = await pool.query<{
    "QUERY PLAN": { Plan: { "Index Name"?: string; Plans?: unknown[] } }[];
  }>(
    "EXPLAIN (FORMAT JSON) SELECT * FROM workflows WHERE workspace_id = $1 ORDER BY updated_at DESC, id LIMIT 50",
    [SEED.workspaceA]
  );
  const serializedPlan = JSON.stringify(plan.rows);
  assert(
    serializedPlan.includes("workflows_workspace_updated_idx"),
    "Workflow list plan missed its index"
  );
  const detailPlan = await pool.query<{ "QUERY PLAN": unknown }>(
    "EXPLAIN (FORMAT JSON) SELECT * FROM workflows WHERE workspace_id = $1 AND id = $2",
    [SEED.workspaceA, SEED.workflow]
  );
  const serializedDetailPlan = JSON.stringify(detailPlan.rows);
  assert(serializedDetailPlan.includes("workflows_pkey"), "Workflow detail plan missed its index");
  const backup = docker(
    "exec",
    containerName,
    "pg_dump",
    "--username",
    "knotline_local",
    "--schema-only",
    "knotline"
  );
  assert(backup.includes("CREATE TABLE public.workflows"), "Schema backup omitted workflows");
  docker("exec", containerName, "createdb", "--username", "knotline_local", "knotline_restore");
  execFileSync(
    "docker",
    [
      "exec",
      "--interactive",
      containerName,
      "psql",
      "--username",
      "knotline_local",
      "--dbname",
      "knotline_restore"
    ],
    { input: backup, stdio: ["pipe", "ignore", "pipe"] }
  );
  const restored = docker(
    "exec",
    containerName,
    "psql",
    "--username",
    "knotline_local",
    "--dbname",
    "knotline_restore",
    "--tuples-only",
    "--command",
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
  );
  assert(Number(restored) >= 11, "Schema backup restore did not contain all tables");
  return {
    generated,
    lockDurationMs: Math.round(lockDurationMs),
    queryPlan: serializedPlan,
    detailQueryPlan: serializedDetailPlan,
    backupRestoreTables: Number(restored)
  };
}

async function rlsSuite(adminUrl: string, pool: DatabasePool): Promise<Record<string, unknown>> {
  await migrate(adminUrl);
  await seedSyntheticTenants(pool);
  const tenantTables = [
    "workspaces",
    "memberships",
    "workflows",
    "workflow_versions",
    "workflow_nodes",
    "workflow_edges",
    "idempotency_records",
    "audit_events",
    "outbox_events"
  ];
  const role = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
    "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'knotline_runtime'"
  );
  assert(
    role.rows[0]?.rolbypassrls === false && role.rows[0]?.rolsuper === false,
    "Runtime can bypass RLS"
  );

  const namesA = await withTenantTransaction(pool, contextA, (client) =>
    client.query<{ name: string }>("SELECT name FROM workflows ORDER BY name")
  );
  const namesB = await withTenantTransaction(pool, contextB, (client) =>
    client.query<{ name: string }>("SELECT name FROM workflows ORDER BY name")
  );
  assert(
    namesA.rows.length === 1 && namesA.rows[0]?.name.startsWith("Launch"),
    "Tenant A leaked or lost data"
  );
  assert(
    namesB.rows.length === 1 && namesB.rows[0]?.name.startsWith("Harbor"),
    "Tenant B leaked or lost data"
  );

  for (const table of tenantTables) {
    const result = await withTenantTransaction(pool, contextA, (client) =>
      client.query<{ visible: number }>(
        `SELECT count(*)::integer AS visible FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"} = $1`,
        [SEED.workspaceB]
      )
    );
    assert(result.rows[0]?.visible === 0, `${table} exposed tenant B to tenant A`);
  }

  await expectRejected(
    () =>
      withTenantTransaction(pool, contextA, (client) =>
        client.query(
          `INSERT INTO workflow_versions(workspace_id, workflow_id, version, definition, content_hash)
           VALUES ($1, $2, 2, '{}', $3)`,
          [SEED.workspaceB, SEED.workflow, `sha256:${"0".repeat(64)}`]
        )
      ),
    "row-level security"
  );
  await expectRejected(
    () =>
      withTenantTransaction(pool, contextA, (client) =>
        client.query(
          "UPDATE workflow_versions SET definition = '{}' WHERE workspace_id = $1 AND workflow_id = $2",
          [SEED.workspaceA, SEED.workflow]
        )
      ),
    "immutable"
  );
  await expectRejected(
    () =>
      pool.query(
        `INSERT INTO workflow_nodes(
           workspace_id, workflow_id, workflow_version, id, stable_key, kind
         ) VALUES ($1, $2, 1, '60000000-0000-4000-8000-000000000001', 'immutable_probe', 'action')`,
        [SEED.workspaceA, SEED.workflow]
      ),
    "immutable"
  );

  const crossWorkflow = "30000000-0000-4000-8000-000000000099";
  const sourceNode = "60000000-0000-4000-8000-000000000010";
  const targetNode = "60000000-0000-4000-8000-000000000011";
  await pool.query(
    `INSERT INTO workflows(workspace_id, id, name) VALUES
     ($1, $3, 'Cross tenant A'), ($2, $3, 'Cross tenant B')`,
    [SEED.workspaceA, SEED.workspaceB, crossWorkflow]
  );
  await pool.query(
    `INSERT INTO workflow_versions(workspace_id, workflow_id, version, definition, content_hash) VALUES
     ($1, $3, 1, '{}', $4), ($2, $3, 1, '{}', $4)`,
    [SEED.workspaceA, SEED.workspaceB, crossWorkflow, `sha256:${"1".repeat(64)}`]
  );
  await pool.query(
    `INSERT INTO workflow_nodes(workspace_id, workflow_id, workflow_version, id, stable_key, kind) VALUES
     ($1, $3, 1, $4, 'source_a', 'action'), ($2, $3, 1, $5, 'target_b', 'action')`,
    [SEED.workspaceA, SEED.workspaceB, crossWorkflow, sourceNode, targetNode]
  );
  await expectRejected(
    () =>
      pool.query(
        `INSERT INTO workflow_edges(
           workspace_id, workflow_id, workflow_version, id, source_node_id, target_node_id
         ) VALUES ($1, $2, 1, '70000000-0000-4000-8000-000000000001', $3, $4)`,
        [SEED.workspaceB, crossWorkflow, sourceNode, targetNode]
      ),
    "foreign key"
  );
  await expectRejected(
    () =>
      pool.query("UPDATE audit_events SET action = 'changed' WHERE workspace_id = $1", [
        SEED.workspaceA
      ]),
    "append-only"
  );
  await expectRejected(
    () => pool.query("DELETE FROM outbox_events WHERE workspace_id = $1", [SEED.workspaceA]),
    "append-only"
  );
  return { tablesChecked: tenantTables.length, sameShapedResourceId: SEED.workflow };
}

async function integrationSuite(
  adminUrl: string,
  pool: DatabasePool
): Promise<Record<string, unknown>> {
  await migrate(adminUrl);
  await seedSyntheticTenants(pool);
  const repository = new PostgresWorkflowRepository(pool);
  const testAuth = {
    authenticate: () =>
      Promise.resolve({
        identity: {
          sessionId: "30000000-0000-4000-8000-000000000001",
          familyId: "30000000-0000-4000-8000-000000000002",
          user: {
            id: SEED.userA,
            email: "ava@northstar.example",
            displayName: "Ava North",
            status: "active",
            locale: "en",
            timezone: "UTC"
          },
          activeWorkspaceId: SEED.workspaceA,
          issuedAt: new Date(0).toISOString(),
          lastUsedAt: new Date(0).toISOString(),
          idleExpiresAt: new Date(86_400_000).toISOString(),
          absoluteExpiresAt: new Date(86_400_000).toISOString(),
          deviceSummary: "Database test"
        },
        csrfToken: "local-only-database-test-csrf"
      }),
    verifyMutation: () => undefined
  } as unknown as AuthService;
  const appA = await buildApp({
    environment: "test",
    logLevel: false,
    webOrigin: "http://localhost:5173",
    repository,
    auth: testAuth
  });
  const bootstrapResponse = await appA.inject({ method: "GET", url: "/v1/bootstrap" });
  assert(
    bootstrapResponse.statusCode === 200,
    "Authenticated shell seed did not load from PostgreSQL"
  );
  const createResponse = await appA.inject({
    method: "POST",
    url: `/v1/teams/${SEED.workspaceA}/workflows`,
    payload: {
      name: "Persistent restart proof",
      description: "Created before the API process boundary."
    }
  });
  assert(createResponse.statusCode === 201, "Workflow API create did not persist");
  const created = createResponse.json<{ data: { id: string } }>().data;
  await appA.close();

  const poolAfterRestart = createPool(adminUrl, { max: 8 });
  try {
    const repositoryAfterRestart = new PostgresWorkflowRepository(poolAfterRestart);
    const appB = await buildApp({
      environment: "test",
      logLevel: false,
      webOrigin: "http://localhost:5173",
      repository: repositoryAfterRestart,
      auth: testAuth
    });
    const response = await appB.inject({ method: "GET", url: `/v1/workflows/${created.id}` });
    assert(response.statusCode === 200, "Workflow did not persist across API restart");
    await appB.close();

    const countBefore = await withTenantTransaction(pool, contextA, (client) =>
      client.query<{ count: number }>("SELECT count(*)::integer AS count FROM workflows")
    );
    await expectRejected(
      () =>
        repository.create(
          { ...contextA, principalId: "20000000-0000-4000-8000-000000000099" },
          { name: "Must roll back" }
        ),
      "foreign key"
    );
    const countAfter = await withTenantTransaction(pool, contextA, (client) =>
      client.query<{ count: number }>("SELECT count(*)::integer AS count FROM workflows")
    );
    assert(
      countBefore.rows[0]?.count === countAfter.rows[0]?.count,
      "Aggregate rollback left partial state"
    );

    const concurrent = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.create(contextA, { name: `Concurrent workflow ${String(index + 1)}` })
      )
    );
    assert(
      new Set(concurrent.map(({ id }) => id)).size === concurrent.length,
      "Concurrent IDs collided"
    );

    const optimisticTarget = concurrent[0];
    assert(optimisticTarget, "Missing optimistic update fixture");
    const optimisticUpdates = await Promise.all(
      ["Optimistic winner A", "Optimistic winner B"].map((name) =>
        withTenantTransaction(pool, contextA, (client) =>
          client.query(
            `UPDATE workflows SET name = $1, optimistic_version = optimistic_version + 1
             WHERE workspace_id = $2 AND id = $3 AND optimistic_version = 1`,
            [name, SEED.workspaceA, optimisticTarget.id]
          )
        )
      )
    );
    assert(
      optimisticUpdates.filter(({ rowCount }) => rowCount === 1).length === 1,
      "Optimistic concurrency did not select exactly one winner"
    );

    await expectRejected(
      () =>
        repository.create(
          { ...contextA, mutationsDisabled: true },
          { name: "Emergency control must block this" }
        ),
      "KNOTLINE_MUTATIONS_DISABLED"
    );
    return {
      persistedWorkflowId: created.id,
      concurrentCreates: concurrent.length,
      optimisticWinnerCount: 1,
      rollbackVerified: true
    };
  } finally {
    await poolAfterRestart.end();
  }
}

let pool: DatabasePool | undefined;
try {
  const started = await startPostgres();
  pool = started.pool;
  const result =
    mode === "migrations"
      ? await migrationSuite(started.adminUrl, pool)
      : mode === "rls"
        ? await rlsSuite(started.adminUrl, pool)
        : await integrationSuite(started.adminUrl, pool);
  const artifactDirectory = resolve("artifacts/database/M03");
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    resolve(artifactDirectory, `${mode}.json`),
    `${JSON.stringify({ schemaVersion: 1, mode, image: IMAGE, retries: 0, result }, null, 2)}\n`
  );
  process.stdout.write(`M03 PostgreSQL ${mode} suite passed.\n`);
} catch (error) {
  const logs = spawnSync("docker", ["logs", "--tail", "200", containerName], { encoding: "utf8" });
  process.stderr.write(logs.stdout ?? "");
  process.stderr.write(logs.stderr ?? "");
  throw error;
} finally {
  await pool?.end();
  spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
}
