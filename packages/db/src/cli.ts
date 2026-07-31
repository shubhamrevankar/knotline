import { createPool } from "./client.js";
import { migrate } from "./migrations.js";
import { validateDataStoreRegistry } from "./registry.js";
import { generateRealisticData, seedSyntheticTenants } from "./seed.js";

const command = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (command === "registry-check") {
  const registry = await validateDataStoreRegistry();
  process.stdout.write(`Validated ${String(registry.stores.length)} durable stores.\n`);
} else {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (command === "migrate") {
    const applied = await migrate(databaseUrl);
    process.stdout.write(`Applied ${String(applied.length)} migration(s).\n`);
  } else {
    const pool = createPool(databaseUrl, { max: 2 });
    try {
      if (command === "seed") {
        await seedSyntheticTenants(pool);
        process.stdout.write("Seeded two isolated synthetic workspaces.\n");
      } else if (command === "generate") {
        const count = Number(process.argv[3] ?? "10000");
        await generateRealisticData(pool, count);
        process.stdout.write(`Generated ${String(count)} realistic workflow rows.\n`);
      } else {
        throw new Error("Usage: cli.ts migrate|seed|generate [count]|registry-check");
      }
    } finally {
      await pool.end();
    }
  }
}
