import type { Pool, PoolClient } from "pg";

export interface TenantContext {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly requestId: string;
  readonly mutationsDisabled?: boolean;
}

export async function withTenantTransaction<T>(
  pool: Pool,
  context: TenantContext,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE knotline_runtime");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [context.workspaceId]);
    await client.query("SELECT set_config('app.principal_id', $1, true)", [context.principalId]);
    await client.query("SELECT set_config('app.request_id', $1, true)", [context.requestId]);
    await client.query("SELECT set_config('app.mutations_disabled', $1, true)", [
      context.mutationsDisabled ? "true" : "false"
    ]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
