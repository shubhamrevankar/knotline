import type { Pool } from "pg";

import { contentHash } from "./values.js";

export const SEED = {
  workspaceA: "10000000-0000-4000-8000-000000000001",
  workspaceB: "10000000-0000-4000-8000-000000000002",
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002",
  workflow: "30000000-0000-4000-8000-000000000001"
} as const;

export async function seedSyntheticTenants(pool: Pool): Promise<void> {
  const client = await pool.connect();
  const definition = { nodes: [], edges: [] };
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users(id, email, display_name) VALUES
       ($1, 'maya@northstar.example', 'Maya Chen'),
       ($2, 'elias@harbor.example', 'Elias Morgan')
       ON CONFLICT (id) DO NOTHING`,
      [SEED.userA, SEED.userB]
    );
    await client.query(
      `INSERT INTO workspaces(id, slug, name) VALUES
       ($1, 'northstar-studio', 'Northstar Studio'),
       ($2, 'harbor-labs', 'Harbor Labs')
       ON CONFLICT (id) DO NOTHING`,
      [SEED.workspaceA, SEED.workspaceB]
    );
    await client.query(
      `INSERT INTO memberships(workspace_id, id, user_id, role) VALUES
       ($1, '21000000-0000-4000-8000-000000000001', $2, 'owner'),
       ($3, '21000000-0000-4000-8000-000000000002', $4, 'owner')
       ON CONFLICT (workspace_id, id) DO NOTHING`,
      [SEED.workspaceA, SEED.userA, SEED.workspaceB, SEED.userB]
    );
    await client.query(
      `INSERT INTO workflows(workspace_id, id, name, description, state) VALUES
       ($1, $2, 'Launch intelligence brief', 'Northstar tenant-owned workflow.', 'active'),
       ($3, $2, 'Harbor operations review', 'Harbor tenant-owned workflow.', 'active')
       ON CONFLICT (workspace_id, id) DO NOTHING`,
      [SEED.workspaceA, SEED.workflow, SEED.workspaceB]
    );
    await client.query(
      `INSERT INTO workflow_versions(
         workspace_id, workflow_id, version, state, definition, content_hash, published_at
       ) VALUES
       ($1, $2, 1, 'published', $3, $4, clock_timestamp()),
       ($5, $2, 1, 'published', $3, $4, clock_timestamp())
       ON CONFLICT (workspace_id, workflow_id, version) DO NOTHING`,
      [SEED.workspaceA, SEED.workflow, definition, contentHash(definition), SEED.workspaceB]
    );
    await client.query(
      `INSERT INTO audit_events(
         workspace_id, id, actor_id, action, resource_type, resource_id, result, request_id, metadata
       ) VALUES
       ($1, '40000000-0000-4000-8000-000000000001', $2, 'seed.created', 'workflow', $3, 'succeeded', 'seed-a', '{}'),
       ($4, '40000000-0000-4000-8000-000000000002', $5, 'seed.created', 'workflow', $3, 'succeeded', 'seed-b', '{}')
       ON CONFLICT (workspace_id, id) DO NOTHING`,
      [SEED.workspaceA, SEED.userA, SEED.workflow, SEED.workspaceB, SEED.userB]
    );
    await client.query(
      `INSERT INTO outbox_events(
         workspace_id, id, aggregate_type, aggregate_id, event_type, payload
       ) VALUES
       ($1, '50000000-0000-4000-8000-000000000001', 'workflow', $2, 'seed.created.v1', '{}'),
       ($3, '50000000-0000-4000-8000-000000000002', 'workflow', $2, 'seed.created.v1', '{}')
       ON CONFLICT (workspace_id, id) DO NOTHING`,
      [SEED.workspaceA, SEED.workflow, SEED.workspaceB]
    );
    const fixtureConnector = {
      key: "fixture-cloud",
      version: "1.0.0",
      displayName: "Fixture Cloud",
      provider: "fixture",
      authMethods: ["oauth2"],
      capabilities: ["discover", "read", "webhook", "poll", "permissions", "reconcile"],
      requiredScopes: ["objects.read"],
      optionalScopes: ["profile.read"],
      objectTypes: ["page", "person"],
      triggers: ["object.changed"],
      actions: [],
      permissionFidelity: "exact",
      webhookMode: "application",
      regions: ["local"],
      rateLimits: { concurrency: 2, requestsPerMinute: 60 },
      oauth: {
        authorizationEndpoint: "http://127.0.0.1:4100/__local/connectors/fixture/authorize",
        tokenEndpoint: "http://127.0.0.1:4100/__local/connectors/fixture/token"
      }
    };
    await client.query(
      `INSERT INTO connector_manifest_versions(workspace_id,id,connector_key,semantic_version,manifest,content_hash,state,rollout_percent,created_by) VALUES
       ($1,'22000000-0000-4000-8000-000000000001','fixture-cloud','1.0.0',$2,$3,'active',100,$4),
       ($5,'22000000-0000-4000-8000-000000000001','fixture-cloud','1.0.0',$2,$3,'active',100,$6)
       ON CONFLICT(workspace_id,id) DO NOTHING`,
      [
        SEED.workspaceA,
        fixtureConnector,
        contentHash(fixtureConnector),
        SEED.userA,
        SEED.workspaceB,
        SEED.userB
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function generateRealisticData(pool: Pool, count = 10_000): Promise<number> {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) {
    throw new Error("Generator count must be between 1 and 1,000,000");
  }
  await pool.query(
    `INSERT INTO workflows(workspace_id, id, name, description, state)
     SELECT $1, md5('generated-' || value::text)::uuid,
            'Generated workflow ' || value::text, 'Synthetic migration-volume fixture', 'draft'
     FROM generate_series(1, $2::integer) AS value
     ON CONFLICT (workspace_id, id) DO NOTHING`,
    [SEED.workspaceA, count]
  );
  return count;
}
