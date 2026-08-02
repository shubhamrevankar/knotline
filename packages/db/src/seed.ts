import type { Pool } from "pg";
import {
  KNOWLEDGE_PROVIDER_MANIFESTS,
  PROVIDER_CAPABILITY_STATUS,
  COLLABORATION_PROVIDER_MANIFESTS,
  COLLABORATION_EXTERNAL_GATES,
  DATA_PROVIDER_MANIFESTS,
  DATA_PROVIDER_EXTERNAL_GATES,
  certifyDataProvider,
  certifyCollaborationProvider,
  certifyKnowledgeProvider,
  type CollaborationProvider,
  type DataProvider,
  type KnowledgeProvider
} from "@knotline/connector-sdk";

import { contentHash } from "./values.js";

export const SEED = {
  workspaceA: "10000000-0000-4000-8000-000000000001",
  workspaceB: "10000000-0000-4000-8000-000000000002",
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002",
  workflow: "30000000-0000-4000-8000-000000000001",
  agent: "33000000-0000-4000-8000-000000000001"
} as const;

export async function seedSyntheticTenants(pool: Pool): Promise<void> {
  const client = await pool.connect();
  const definition = {
    schemaVersion: 1,
    name: "Launch intelligence brief",
    description: "Turn a launch signal into a governed intelligence brief with human approval.",
    inputSchema: { type: "object", additionalProperties: true },
    outputSchema: { type: "object", additionalProperties: true },
    nodes: [
      {
        key: "launch_signal",
        kind: "trigger",
        name: "Receive launch signal",
        description: "Accept the structured launch request.",
        position: { x: 80, y: 180 },
        configuration: { owner: "Product operations", status: "complete" }
      },
      {
        key: "research_brief",
        kind: "agent",
        name: "Research market context",
        description: "Compile grounded launch intelligence from authorized sources.",
        position: { x: 360, y: 180 },
        configuration: {
          owner: "Market analyst",
          status: "running",
          agentId: SEED.agent,
          agentVersion: 1,
          fixtureAgentSteps: [
            {
              type: "final",
              output: {
                executiveSummary:
                  "The launch is positioned for operations teams that need governed human and AI execution.",
                marketSignals: [
                  "Buyers expect visible approval boundaries for consequential automation.",
                  "Operational teams value durable execution and source-backed outputs."
                ],
                recommendation:
                  "Lead with legibility, bounded agent authority, and a complete audit trail."
              },
              summary: "Market context compiled from the authorized launch brief.",
              usage: {
                inputTokens: 428,
                outputTokens: 186,
                costDecimal: "0.014200000000"
              }
            }
          ]
        }
      },
      {
        key: "leadership_review",
        kind: "approval",
        name: "Leadership review",
        description: "Review claims, evidence, risk, and release readiness.",
        position: { x: 640, y: 180 },
        configuration: {
          owner: "Launch council",
          status: "waiting",
          policy: "launch-readiness-v1",
          timeoutMs: 900_000,
          allowSelfApproval: true,
          proposedAction: "Authorize publication of the evidence-backed launch brief",
          riskLevel: "medium",
          riskFindings: ["The approved narrative will become the release baseline."],
          diff: {
            status: { from: "draft", to: "approved" },
            audience: "Product, sales, and customer operations"
          }
        }
      },
      {
        key: "publish_brief",
        kind: "human",
        name: "Publish launch brief",
        description: "Finalize the approved narrative and distribution plan.",
        position: { x: 920, y: 180 },
        configuration: {
          owner: "Maya Chen",
          status: "queued",
          assignment: "workflow_initiator",
          formSchema: {
            schemaVersion: 1,
            title: "Publish the approved launch brief",
            fields: [
              {
                key: "publication_note",
                label: "Publication note",
                type: "rich_text",
                required: true,
                help: "Confirm the final audience and publication context."
              }
            ]
          }
        }
      }
    ],
    edges: [
      { key: "signal_to_research", source: "launch_signal", target: "research_brief" },
      { key: "research_to_review", source: "research_brief", target: "leadership_review" },
      { key: "review_to_publish", source: "leadership_review", target: "publish_brief" }
    ]
  } as const;
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
    const agentDefinition = {
      schemaVersion: 1,
      name: "Market intelligence analyst",
      description: "Produces a bounded, evidence-backed launch intelligence brief.",
      purpose: "Turn authorized launch context into structured market signals and recommendations.",
      visibility: "workspace",
      tags: ["launch", "research"],
      prompts: {
        system: "You are a careful market intelligence analyst.",
        developer: "Use only the authorized context and return the required schema.",
        user: "Prepare the launch intelligence brief.",
        variables: []
      },
      modelPolicy: {
        role: "balanced",
        requiredCapabilities: ["text", "structured_output"],
        temperature: 0.2,
        reasoning: "medium",
        fallbackRoles: ["fast"]
      },
      inputSchema: { type: "object", additionalProperties: true },
      outputSchema: { type: "object", additionalProperties: true },
      tools: [],
      knowledge: [],
      memory: { scope: "none", retentionDays: 0, purpose: "" },
      limits: {
        maxModelCalls: 3,
        maxToolCalls: 0,
        maxInputTokens: 4000,
        maxOutputTokens: 2000,
        maxDurationMs: 120000,
        maxCostMinor: 100
      },
      fallback: { behavior: "human_task", message: "Route research to a person." },
      humanApproval: { requiredForRisk: ["high", "critical"] }
    };
    await client.query(
      `INSERT INTO agent_definitions(
       workspace_id,id,stable_key,name,description,owner_id,visibility,state,current_version
       ) VALUES
       ($1,$2,'market-intelligence-analyst','Market intelligence analyst',$3,$4,'workspace','active',1)
       ON CONFLICT (workspace_id,id) DO NOTHING`,
      [SEED.workspaceA, SEED.agent, agentDefinition.description, SEED.userA]
    );
    await client.query(
      `INSERT INTO agent_versions(
       workspace_id,agent_id,version,definition,content_hash,change_summary,published_by
       ) VALUES
       ($1,$2,1,$3,$4,'Initial governed demo release',$5)
       ON CONFLICT (workspace_id,agent_id,version) DO NOTHING`,
      [SEED.workspaceA, SEED.agent, agentDefinition, contentHash(agentDefinition), SEED.userA]
    );
    await client.query(
      `INSERT INTO agent_drafts(
       workspace_id,agent_id,revision,definition,content_hash,validation_findings,updated_by
       ) VALUES
       ($1,$2,1,$3,$4,'[]'::jsonb,$5)
       ON CONFLICT (workspace_id,agent_id) DO NOTHING`,
      [SEED.workspaceA, SEED.agent, agentDefinition, contentHash(agentDefinition), SEED.userA]
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
      `INSERT INTO workflow_versions(
         workspace_id, workflow_id, version, state, definition, content_hash, created_by
       ) VALUES
       ($1, $2, 2, 'draft', $3, $4, $5),
       ($6, $2, 2, 'draft', $3, $4, $7)
       ON CONFLICT (workspace_id, workflow_id, version) DO NOTHING`,
      [
        SEED.workspaceA,
        SEED.workflow,
        definition,
        contentHash(definition),
        SEED.userA,
        SEED.workspaceB,
        SEED.userB
      ]
    );
    await client.query(
      `INSERT INTO workflow_versions(
         workspace_id, workflow_id, version, state, definition, content_hash, draft_revision, created_by
       ) VALUES
       ($1, $2, 3, 'draft', $3, $4, 1, $5),
       ($6, $2, 3, 'draft', $3, $4, 1, $7)
       ON CONFLICT (workspace_id, workflow_id, version) DO NOTHING`,
      [
        SEED.workspaceA,
        SEED.workflow,
        definition,
        contentHash(definition),
        SEED.userA,
        SEED.workspaceB,
        SEED.userB
      ]
    );
    const nodeIds = new Map(
      definition.nodes.map((node, index) => [
        node.key,
        `31000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      ])
    );
    const edgeIds = definition.edges.map(
      (_, index) => `32000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    for (const workspaceId of [SEED.workspaceA, SEED.workspaceB]) {
      for (const version of [2, 3]) {
        for (const node of definition.nodes) {
          await client.query(
            `INSERT INTO workflow_nodes(
               workspace_id,workflow_id,workflow_version,id,stable_key,kind,configuration,position_x,position_y
             ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
             WHERE EXISTS (
               SELECT 1 FROM workflow_versions
               WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3 AND state='draft'
             )
             ON CONFLICT (workspace_id,workflow_id,workflow_version,stable_key) DO NOTHING`,
            [
              workspaceId,
              SEED.workflow,
              version,
              nodeIds.get(node.key),
              node.key,
              node.kind,
              { title: node.name, description: node.description, ...node.configuration },
              node.position.x,
              node.position.y
            ]
          );
        }
        for (const [index, edge] of definition.edges.entries()) {
          await client.query(
            `INSERT INTO workflow_edges(
               workspace_id,workflow_id,workflow_version,id,source_node_id,target_node_id,configuration
             ) SELECT $1,$2,$3,$4,$5,$6,$7
             WHERE EXISTS (
               SELECT 1 FROM workflow_versions
               WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3 AND state='draft'
             )
             ON CONFLICT (workspace_id,workflow_id,workflow_version,id) DO NOTHING`,
            [
              workspaceId,
              SEED.workflow,
              version,
              edgeIds[index],
              nodeIds.get(edge.source),
              nodeIds.get(edge.target),
              { key: edge.key }
            ]
          );
        }
      }
    }
    await client.query(
      `UPDATE workflow_versions
       SET state='published', published_at=clock_timestamp(), release_note='Synthetic demo baseline'
       WHERE workflow_id=$1 AND workspace_id=ANY($2::uuid[]) AND version=2 AND state='draft'`,
      [SEED.workflow, [SEED.workspaceA, SEED.workspaceB]]
    );
    await client.query(
      `UPDATE workflow_versions
       SET definition=$3,content_hash=$4,draft_revision=draft_revision+1
       WHERE workflow_id=$1 AND workspace_id=ANY($2::uuid[]) AND version=3 AND state='draft'`,
      [SEED.workflow, [SEED.workspaceA, SEED.workspaceB], definition, contentHash(definition)]
    );
    for (const workspaceId of [SEED.workspaceA, SEED.workspaceB])
      for (const node of definition.nodes)
        await client.query(
          `UPDATE workflow_nodes SET kind=$4,configuration=$5,position_x=$6,position_y=$7
           WHERE workspace_id=$1 AND workflow_id=$2 AND workflow_version=3 AND stable_key=$3
             AND EXISTS (
               SELECT 1 FROM workflow_versions
               WHERE workspace_id=$1 AND workflow_id=$2 AND version=3 AND state='draft'
             )`,
          [
            workspaceId,
            SEED.workflow,
            node.key,
            node.kind,
            { title: node.name, description: node.description, ...node.configuration },
            node.position.x,
            node.position.y
          ]
        );
    await client.query(
      `UPDATE workflow_versions
       SET state='published',published_at=clock_timestamp(),release_note='Complete executable demo scenario'
       WHERE workflow_id=$1 AND workspace_id=ANY($2::uuid[]) AND version=3 AND state='draft'`,
      [SEED.workflow, [SEED.workspaceA, SEED.workspaceB]]
    );
    await client.query(
      `UPDATE workflows SET current_version=3
       WHERE id=$1 AND workspace_id=ANY($2::uuid[]) AND current_version<3`,
      [SEED.workflow, [SEED.workspaceA, SEED.workspaceB]]
    );
    for (const version of [14, 15]) {
      await client.query(
        `INSERT INTO workflow_versions(
           workspace_id,workflow_id,version,state,definition,content_hash,draft_revision,created_by
         ) VALUES
         ($1,$2,$3,'draft',$4,$5,1,$6),
         ($7,$2,$3,'draft',$4,$5,1,$8)
         ON CONFLICT (workspace_id,workflow_id,version) DO NOTHING`,
        [
          SEED.workspaceA,
          SEED.workflow,
          version,
          definition,
          contentHash(definition),
          SEED.userA,
          SEED.workspaceB,
          SEED.userB
        ]
      );
      for (const workspaceId of [SEED.workspaceA, SEED.workspaceB]) {
        for (const node of definition.nodes)
          await client.query(
            `INSERT INTO workflow_nodes(
               workspace_id,workflow_id,workflow_version,id,stable_key,kind,configuration,position_x,position_y
             ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
             WHERE EXISTS (
               SELECT 1 FROM workflow_versions
               WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3 AND state='draft'
             )
             ON CONFLICT (workspace_id,workflow_id,workflow_version,stable_key) DO NOTHING`,
            [
              workspaceId,
              SEED.workflow,
              version,
              nodeIds.get(node.key),
              node.key,
              node.kind,
              { title: node.name, description: node.description, ...node.configuration },
              node.position.x,
              node.position.y
            ]
          );
        for (const [index, edge] of definition.edges.entries())
          await client.query(
            `INSERT INTO workflow_edges(
               workspace_id,workflow_id,workflow_version,id,source_node_id,target_node_id,configuration
             ) SELECT $1,$2,$3,$4,$5,$6,$7
             WHERE EXISTS (
               SELECT 1 FROM workflow_versions
               WHERE workspace_id=$1 AND workflow_id=$2 AND version=$3 AND state='draft'
             )
             ON CONFLICT (workspace_id,workflow_id,workflow_version,id) DO NOTHING`,
            [
              workspaceId,
              SEED.workflow,
              version,
              edgeIds[index],
              nodeIds.get(edge.source),
              nodeIds.get(edge.target),
              { key: edge.key }
            ]
          );
      }
    }
    await client.query(
      `UPDATE workflow_versions
       SET state='published',published_at=clock_timestamp(),release_note='Complete executable demo scenario'
       WHERE workflow_id=$1 AND workspace_id=ANY($2::uuid[]) AND version=14 AND state='draft'`,
      [SEED.workflow, [SEED.workspaceA, SEED.workspaceB]]
    );
    await client.query(
      `UPDATE workflows SET current_version=14
       WHERE id=$1 AND workspace_id=ANY($2::uuid[]) AND current_version<14`,
      [SEED.workflow, [SEED.workspaceA, SEED.workspaceB]]
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
    const providerIds: Readonly<Record<KnowledgeProvider, string>> = {
      "google-workspace": "23000000-0000-4000-8000-000000000001",
      notion: "23000000-0000-4000-8000-000000000002",
      "confluence-cloud": "23000000-0000-4000-8000-000000000003"
    };
    const certificationIds: Readonly<Record<KnowledgeProvider, string>> = {
      "google-workspace": "24000000-0000-4000-8000-000000000001",
      notion: "24000000-0000-4000-8000-000000000002",
      "confluence-cloud": "24000000-0000-4000-8000-000000000003"
    };
    for (const provider of ["google-workspace", "notion", "confluence-cloud"] as const) {
      const manifest = KNOWLEDGE_PROVIDER_MANIFESTS[provider];
      const certification = certifyKnowledgeProvider(provider);
      const status = PROVIDER_CAPABILITY_STATUS[provider];
      for (const [workspaceId, userId] of [
        [SEED.workspaceA, SEED.userA],
        [SEED.workspaceB, SEED.userB]
      ] as const) {
        await client.query(
          `INSERT INTO connector_manifest_versions(workspace_id,id,connector_key,semantic_version,manifest,content_hash,state,rollout_percent,created_by)
           VALUES($1,$2,$3,$4,$5,$6,'active',100,$7)
           ON CONFLICT(workspace_id,id) DO NOTHING`,
          [
            workspaceId,
            providerIds[provider],
            manifest.key,
            manifest.version,
            manifest,
            contentHash(manifest),
            userId
          ]
        );
        await client.query(
          `INSERT INTO provider_connector_certifications(workspace_id,id,connector_key,manifest_version,engineering_status,live_status,external_gate,fixture_digest,capabilities,limitations,certified_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2026-07-31T00:00:00Z')
           ON CONFLICT(workspace_id,id) DO NOTHING`,
          [
            workspaceId,
            certificationIds[provider],
            manifest.key,
            manifest.version,
            certification.engineeringStatus,
            certification.liveStatus,
            status.externalGate,
            contentHash(certification),
            certification,
            JSON.stringify(status.limitations)
          ]
        );
      }
    }
    const collaborationProviderIds: Readonly<Record<CollaborationProvider, string>> = {
      linear: "25000000-0000-4000-8000-000000000001",
      "jira-cloud": "25000000-0000-4000-8000-000000000002",
      github: "25000000-0000-4000-8000-000000000003",
      slack: "25000000-0000-4000-8000-000000000004",
      "microsoft-teams": "25000000-0000-4000-8000-000000000005",
      x: "25000000-0000-4000-8000-000000000006"
    };
    const collaborationCertificationIds: Readonly<Record<CollaborationProvider, string>> = {
      linear: "26000000-0000-4000-8000-000000000001",
      "jira-cloud": "26000000-0000-4000-8000-000000000002",
      github: "26000000-0000-4000-8000-000000000003",
      slack: "26000000-0000-4000-8000-000000000004",
      "microsoft-teams": "26000000-0000-4000-8000-000000000005",
      x: "26000000-0000-4000-8000-000000000006"
    };
    for (const provider of [
      "linear",
      "jira-cloud",
      "github",
      "slack",
      "microsoft-teams",
      "x"
    ] as const) {
      const manifest = COLLABORATION_PROVIDER_MANIFESTS[provider];
      const certification = certifyCollaborationProvider(provider);
      for (const [workspaceId, userId] of [
        [SEED.workspaceA, SEED.userA],
        [SEED.workspaceB, SEED.userB]
      ] as const) {
        await client.query(
          `INSERT INTO connector_manifest_versions(workspace_id,id,connector_key,semantic_version,manifest,content_hash,state,rollout_percent,created_by)
           VALUES($1,$2,$3,$4,$5,$6,'active',100,$7) ON CONFLICT(workspace_id,id) DO NOTHING`,
          [
            workspaceId,
            collaborationProviderIds[provider],
            manifest.key,
            manifest.version,
            manifest,
            contentHash(manifest),
            userId
          ]
        );
        await client.query(
          `INSERT INTO provider_connector_certifications(workspace_id,id,connector_key,manifest_version,engineering_status,live_status,external_gate,fixture_digest,capabilities,limitations,certified_at)
           VALUES($1,$2,$3,$4,'RECORDED','BLOCKED_EXTERNAL',$5,$6,$7,$8,'2026-08-01T00:00:00Z') ON CONFLICT(workspace_id,id) DO NOTHING`,
          [
            workspaceId,
            collaborationCertificationIds[provider],
            manifest.key,
            manifest.version,
            COLLABORATION_EXTERNAL_GATES[provider],
            contentHash(certification),
            certification,
            JSON.stringify([
              "Recorded fixtures are certified; provider sandbox certification is required before LIVE."
            ])
          ]
        );
      }
    }
    const dataProviders = [
      "microsoft-365",
      "google-mail-calendar",
      "salesforce",
      "hubspot",
      "s3-compatible",
      "csv-import",
      "generic-rest",
      "signed-webhook"
    ] as const;
    const dataProviderIds = Object.fromEntries(
      dataProviders.map((provider, index) => [
        provider,
        `27000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      ])
    ) as Record<DataProvider, string>;
    const dataCertificationIds = Object.fromEntries(
      dataProviders.map((provider, index) => [
        provider,
        `28000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      ])
    ) as Record<DataProvider, string>;
    for (const provider of dataProviders) {
      const manifest = DATA_PROVIDER_MANIFESTS[provider],
        certification = certifyDataProvider(provider);
      for (const [workspaceId, userId] of [
        [SEED.workspaceA, SEED.userA],
        [SEED.workspaceB, SEED.userB]
      ] as const) {
        await client.query(
          `INSERT INTO connector_manifest_versions(workspace_id,id,connector_key,semantic_version,manifest,content_hash,state,rollout_percent,created_by) VALUES($1,$2,$3,$4,$5,$6,'active',100,$7) ON CONFLICT(workspace_id,id) DO NOTHING`,
          [
            workspaceId,
            dataProviderIds[provider],
            manifest.key,
            manifest.version,
            manifest,
            contentHash(manifest),
            userId
          ]
        );
        await client.query(
          `INSERT INTO provider_connector_certifications(workspace_id,id,connector_key,manifest_version,engineering_status,live_status,external_gate,fixture_digest,capabilities,limitations,certified_at) VALUES($1,$2,$3,$4,'RECORDED','BLOCKED_EXTERNAL',$5,$6,$7,$8,'2026-08-01T00:00:00Z') ON CONFLICT(workspace_id,id) DO NOTHING`,
          [
            workspaceId,
            dataCertificationIds[provider],
            manifest.key,
            manifest.version,
            DATA_PROVIDER_EXTERNAL_GATES[provider],
            contentHash(certification),
            certification,
            JSON.stringify([
              "Recorded fixture certification only; production activation remains blocked."
            ])
          ]
        );
      }
    }
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
