import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

export interface MigrationRecord {
  readonly id: string;
  readonly checksum: string;
}

const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

export async function loadMigrations(): Promise<readonly (MigrationRecord & { sql: string })[]> {
  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
    .sort();
  return Promise.all(
    files.map(async (id) => {
      const sql = await readFile(new URL(`../migrations/${id}`, import.meta.url), "utf8");
      return {
        id,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex")
      };
    })
  );
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS knotline_schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      duration_ms integer NOT NULL CHECK (duration_ms >= 0)
    )
  `);
}

export async function migrate(databaseUrl: string): Promise<readonly MigrationRecord[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const applied: MigrationRecord[] = [];
  try {
    const client = await pool.connect();
    try {
      await ensureMigrationTable(client);
      for (const migration of await loadMigrations()) {
        const existing = await client.query<{ checksum: string }>(
          "SELECT checksum FROM knotline_schema_migrations WHERE id = $1",
          [migration.id]
        );
        if (existing.rowCount === 1) {
          if (existing.rows[0]?.checksum !== migration.checksum) {
            throw new Error(`Migration checksum mismatch: ${migration.id}`);
          }
          continue;
        }
        const startedAt = performance.now();
        await client.query("BEGIN");
        try {
          await client.query(migration.sql);
          await client.query(
            "INSERT INTO knotline_schema_migrations(id, checksum, duration_ms) VALUES ($1, $2, $3)",
            [
              migration.id,
              migration.checksum,
              Math.max(0, Math.round(performance.now() - startedAt))
            ]
          );
          await client.query("COMMIT");
          applied.push({ id: migration.id, checksum: migration.checksum });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      await client.query(
        "GRANT SELECT ON knotline_schema_migrations TO knotline_runtime, knotline_reporting, knotline_repair"
      );
    } finally {
      client.release();
    }
    return applied;
  } finally {
    await pool.end();
  }
}

export async function migrationCompatibility(pool: Pool): Promise<{
  readonly compatible: boolean;
  readonly expected: readonly string[];
  readonly applied: readonly string[];
}> {
  const expectedMigrations = await loadMigrations();
  const expected = expectedMigrations.map(({ id }) => id);
  try {
    const result = await pool.query<{ id: string; checksum: string }>(
      "SELECT id, checksum FROM knotline_schema_migrations ORDER BY id"
    );
    const applied = result.rows.map(({ id }) => id);
    return {
      compatible:
        expected.length === applied.length &&
        expectedMigrations.every(
          (migration, index) =>
            result.rows[index]?.id === migration.id &&
            result.rows[index]?.checksum === migration.checksum
        ),
      expected,
      applied
    };
  } catch {
    return { compatible: false, expected, applied: [] };
  }
}
