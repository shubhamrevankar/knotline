import { loadConfig } from "@knotline/config";
import {
  createPool,
  migrate,
  PostgresWorkflowRepository,
  SEED,
  seedSyntheticTenants
} from "@knotline/db";

import { buildApp } from "./app.js";

const environment = loadConfig(process.env);
if (environment.environment === "local") {
  const migrationUrl = process.env.DB_MIGRATION_URL;
  if (!migrationUrl) throw new Error("DB_MIGRATION_URL is required in local mode");
  await migrate(migrationUrl);
  const migrationPool = createPool(migrationUrl, { max: 1 });
  try {
    await seedSyntheticTenants(migrationPool);
  } finally {
    await migrationPool.end();
  }
}
const pool = createPool(environment.databaseUrl.href);
const repository = new PostgresWorkflowRepository(pool, (observation) => {
  process.stdout.write(`${JSON.stringify({ event: "database.query", ...observation })}\n`);
});

const app = await buildApp({
  environment: environment.environment,
  logLevel: environment.logLevel,
  webOrigin: environment.api.webOrigin.origin,
  repository,
  workspaceId: SEED.workspaceA,
  principalId: SEED.userA,
  mutationsDisabled: process.env.KNOTLINE_MUTATIONS_DISABLED === "true"
});

app.addHook("onClose", async () => pool.end());

await app.listen({ host: "0.0.0.0", port: environment.api.port });
