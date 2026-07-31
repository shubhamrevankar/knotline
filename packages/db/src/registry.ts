import { readFile } from "node:fs/promises";

interface Registry {
  schemaVersion: number;
  owner: { team: string; contact: string };
  runbook: string;
  stores: readonly {
    name: string;
    class: string;
    retentionDays: number;
    exportHandler: string;
    deleteHandler: string;
  }[];
  indexes: readonly string[];
  caches: readonly string[];
}

export const REQUIRED_STORES = [
  "users",
  "workspaces",
  "memberships",
  "workflows",
  "workflow_versions",
  "workflow_nodes",
  "workflow_edges",
  "idempotency_records",
  "audit_events",
  "outbox_events",
  "knotline_schema_migrations"
] as const;

export async function validateDataStoreRegistry(): Promise<Registry> {
  const registry = JSON.parse(
    await readFile(new URL("../registry/data-stores.json", import.meta.url), "utf8")
  ) as Registry;
  const errors: string[] = [];
  if (registry.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!registry.owner.team || !registry.owner.contact) errors.push("owner is required");
  if (!registry.runbook.startsWith("docs/operations/knotline/")) errors.push("runbook is invalid");
  const names = new Set(registry.stores.map(({ name }) => name));
  for (const required of REQUIRED_STORES)
    if (!names.has(required)) errors.push(`missing ${required}`);
  for (const store of registry.stores) {
    if (!store.class.includes(".")) errors.push(`${store.name} has invalid class`);
    if (!Number.isInteger(store.retentionDays) || store.retentionDays < 0)
      errors.push(`${store.name} has invalid retention`);
    if (!store.exportHandler || !store.deleteHandler)
      errors.push(`${store.name} has no export/delete handler`);
  }
  if (new Set(registry.indexes).size !== registry.indexes.length) errors.push("duplicate index");
  if (errors.length > 0) throw new Error(`Invalid data-store registry:\n- ${errors.join("\n- ")}`);
  return registry;
}
