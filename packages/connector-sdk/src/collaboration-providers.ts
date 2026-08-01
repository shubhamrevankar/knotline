import { createHash } from "node:crypto";
import type { ConnectorManifest } from "@knotline/contracts";
import { RecordedKnowledgeProvider, type ProviderActionReceipt } from "./knowledge-providers.js";
import { resolveHistoricalInstallation, type InstallationBinding } from "./platform.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type CollaborationProvider =
  "linear" | "jira-cloud" | "github" | "slack" | "microsoft-teams" | "x";
export type ActionRisk = "low" | "medium" | "high";

export interface CollaborationActionPolicy {
  action: string;
  risk: ActionRisk;
  requiredScope: string;
  approval: "recommended" | "required";
  idempotency: "native" | "receipt-lookup";
  compensation: string;
}

const manifest = (
  value: Omit<
    ConnectorManifest,
    "version" | "authMethods" | "permissionFidelity" | "regions" | "rateLimits"
  >
): ConnectorManifest => ({
  ...value,
  version: "1.0.0",
  authMethods: ["oauth2"],
  permissionFidelity: "exact",
  regions: ["us", "eu", "in"],
  rateLimits: { concurrency: 4, requestsPerMinute: 180 }
});

export const COLLABORATION_PROVIDER_MANIFESTS: Readonly<
  Record<CollaborationProvider, ConnectorManifest>
> = {
  linear: manifest({
    key: "linear-work",
    displayName: "Linear",
    provider: "linear",
    capabilities: ["discover", "read", "write", "webhook", "permissions", "reconcile"],
    requiredScopes: ["read"],
    optionalScopes: ["write", "issues:create", "comments:create"],
    objectTypes: ["team", "project", "cycle", "issue", "comment", "label", "member"],
    triggers: ["issue.created", "issue.updated", "comment.created"],
    actions: ["issue.create", "issue.update", "comment.create"],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://linear.app/oauth/authorize",
      tokenEndpoint: "https://api.linear.app/oauth/token"
    }
  }),
  "jira-cloud": manifest({
    key: "jira-cloud-work",
    displayName: "Jira Cloud",
    provider: "atlassian",
    capabilities: ["discover", "read", "write", "webhook", "permissions", "reconcile"],
    requiredScopes: ["read:jira-work", "read:jira-user"],
    optionalScopes: ["write:jira-work", "manage:jira-webhook"],
    objectTypes: [
      "site",
      "project",
      "issue-type",
      "issue",
      "field",
      "comment",
      "user",
      "transition"
    ],
    triggers: ["jira:issue_created", "jira:issue_updated"],
    actions: ["issue.create", "issue.update", "comment.create", "issue.transition"],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://auth.atlassian.com/authorize",
      tokenEndpoint: "https://auth.atlassian.com/oauth/token"
    }
  }),
  github: manifest({
    key: "github-app",
    displayName: "GitHub",
    provider: "github",
    capabilities: ["discover", "read", "write", "webhook", "permissions", "reconcile"],
    requiredScopes: ["metadata:read", "contents:read", "issues:read", "pull_requests:read"],
    optionalScopes: ["issues:write", "pull_requests:write", "checks:write", "contents:write"],
    objectTypes: [
      "organization",
      "repository",
      "issue",
      "pull-request",
      "review",
      "check",
      "comment",
      "commit",
      "file"
    ],
    triggers: ["issues", "pull_request", "check_run", "push"],
    actions: [
      "issue.create",
      "comment.create",
      "pull-request.create",
      "review.create",
      "branch.create"
    ],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://github.com/apps/knotline/installations/new",
      tokenEndpoint: "https://api.github.com/app/installations/token"
    }
  }),
  slack: manifest({
    key: "slack-collaboration",
    displayName: "Slack",
    provider: "slack",
    capabilities: ["discover", "read", "write", "webhook", "permissions", "reconcile"],
    requiredScopes: ["team:read", "users:read", "channels:read"],
    optionalScopes: [
      "channels:history",
      "groups:history",
      "search:read",
      "chat:write",
      "files:read"
    ],
    objectTypes: ["workspace", "channel", "message", "thread", "user", "file"],
    triggers: ["message.channels", "message.groups", "app_mention"],
    actions: ["message.post", "message.update", "message.delete"],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://slack.com/oauth/v2/authorize",
      tokenEndpoint: "https://slack.com/api/oauth.v2.access"
    }
  }),
  "microsoft-teams": manifest({
    key: "microsoft-teams-collaboration",
    displayName: "Microsoft Teams",
    provider: "microsoft",
    capabilities: ["discover", "read", "write", "webhook", "permissions", "reconcile"],
    requiredScopes: ["Team.ReadBasic.All", "Channel.ReadBasic.All"],
    optionalScopes: ["ChannelMessage.Read.All", "ChannelMessage.Send", "Files.Read.All"],
    objectTypes: ["tenant", "team", "channel", "message", "file", "member"],
    triggers: ["channel.message.created", "channel.message.updated"],
    actions: ["channel.message.post", "channel.message.reply"],
    webhookMode: "application",
    oauth: {
      authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    }
  }),
  x: manifest({
    key: "x-publishing",
    displayName: "X",
    provider: "x",
    capabilities: ["discover", "read", "write", "poll", "permissions", "reconcile"],
    requiredScopes: ["users.read", "tweet.read"],
    optionalScopes: ["tweet.write", "offline.access"],
    objectTypes: ["account", "post", "mention"],
    triggers: ["mention.observed"],
    actions: ["post.publish", "post.delete"],
    webhookMode: "connection",
    oauth: {
      authorizationEndpoint: "https://x.com/i/oauth2/authorize",
      tokenEndpoint: "https://api.x.com/2/oauth2/token"
    }
  })
};

export const COLLABORATION_EXTERNAL_GATES: Readonly<Record<CollaborationProvider, string>> = {
  linear: "EXT-010",
  "jira-cloud": "EXT-010",
  github: "EXT-011",
  slack: "EXT-012",
  "microsoft-teams": "EXT-008",
  x: "EXT-014"
};

const policies = (provider: CollaborationProvider): CollaborationActionPolicy[] =>
  COLLABORATION_PROVIDER_MANIFESTS[provider].actions.map((action) => {
    const high = /delete|transition|branch|pull-request|publish/u.test(action);
    return {
      action,
      risk: high ? "high" : "medium",
      requiredScope:
        COLLABORATION_PROVIDER_MANIFESTS[provider].optionalScopes.find((scope) =>
          /write|create|send/u.test(scope)
        ) ?? "provider.write",
      approval: high ? "required" : "recommended",
      idempotency: provider === "linear" || provider === "github" ? "native" : "receipt-lookup",
      compensation: /delete|transition|publish/u.test(action)
        ? "No automatic compensation; reconcile and require operator repair."
        : "Compensating edit/delete is policy and provider dependent."
    };
  });
export const COLLABORATION_ACTION_POLICIES: Readonly<
  Record<CollaborationProvider, readonly CollaborationActionPolicy[]>
> = {
  linear: policies("linear"),
  "jira-cloud": policies("jira-cloud"),
  github: policies("github"),
  slack: policies("slack"),
  "microsoft-teams": policies("microsoft-teams"),
  x: policies("x")
};

export interface ProviderMetadata<T> {
  accountId: string;
  fetchedAt: string;
  expiresAt: string;
  revision: string;
  values: readonly T[];
}
export function selectProviderMetadata<T>(
  live: ProviderMetadata<T> | undefined,
  cached: ProviderMetadata<T> | undefined,
  now = new Date()
) {
  const selected = live ?? cached;
  if (!selected) throw new Error("PROVIDER_METADATA_UNAVAILABLE");
  const stale = new Date(selected.expiresAt) <= now;
  return { ...selected, stale, writable: Boolean(live) && !stale };
}

export function assertFreshActionTarget(input: {
  expectedAccountId: string;
  expectedRevision: string;
  metadata: ProviderMetadata<unknown>;
  scopes: readonly string[];
  policy: CollaborationActionPolicy;
}) {
  if (input.metadata.accountId !== input.expectedAccountId)
    throw new Error("PROVIDER_ACCOUNT_MISMATCH");
  if (input.metadata.revision !== input.expectedRevision)
    throw new Error("STALE_PROVIDER_METADATA");
  if (!input.scopes.includes(input.policy.requiredScope))
    throw new Error("PROVIDER_SCOPE_REQUIRED");
  return true;
}

export interface VerifiedProviderIdentity {
  provider: CollaborationProvider;
  providerAccountId: string;
  providerUserId: string;
  verifiedIdentifier?: string;
  explicitUserId?: string;
}
export function mapProviderIdentity(
  input: VerifiedProviderIdentity,
  verifiedUsers: Readonly<Record<string, string>>
) {
  if (input.explicitUserId)
    return { userId: input.explicitUserId, method: "explicit-administration" as const };
  if (!input.verifiedIdentifier || !verifiedUsers[input.verifiedIdentifier])
    throw new Error("PROVIDER_IDENTITY_UNVERIFIED");
  return {
    userId: verifiedUsers[input.verifiedIdentifier],
    method: "verified-identifier" as const
  };
}

export const escapeProviderText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(/@(channel|everyone|here)\b/giu, "@\u200b$1")
    .replaceAll(/<!(?:channel|everyone|here)>/giu, "[mention removed]")
    .slice(0, 40_000);

export function actionPreview(input: {
  provider: CollaborationProvider;
  accountId: string;
  targetId: string;
  action: string;
  before?: Readonly<Record<string, unknown>>;
  after: Readonly<Record<string, unknown>>;
}) {
  const policy = COLLABORATION_ACTION_POLICIES[input.provider].find(
    (row) => row.action === input.action
  );
  if (!policy) throw new Error("UNSUPPORTED_PROVIDER_ACTION");
  const keys = [
    ...new Set([...Object.keys(input.before ?? {}), ...Object.keys(input.after)])
  ].sort();
  return {
    ...input,
    policy,
    diff: keys.flatMap((key) =>
      JSON.stringify(input.before?.[key]) === JSON.stringify(input.after[key])
        ? []
        : [{ field: key, before: input.before?.[key] ?? null, after: input.after[key] ?? null }]
    ),
    contentHash: digest(input.after)
  };
}

export function availableXActions(tier: { reads: boolean; writes: boolean; deletes: boolean }) {
  return [
    tier.reads ? "post.read" : null,
    tier.writes ? "post.publish" : null,
    tier.deletes ? "post.delete" : null
  ].filter((value): value is string => value !== null);
}

export function prioritizeAclRevocation<
  T extends { kind: "permission" | "delete" | "content"; sequence: number }
>(events: readonly T[]) {
  return [...events].sort(
    (a, b) => Number(b.kind !== "content") - Number(a.kind !== "content") || a.sequence - b.sequence
  );
}

export function paginateProviderObjects<T>(
  pages: readonly { values: readonly T[]; cursor?: string; retryAfterSeconds?: number }[]
) {
  const seen = new Set<string>();
  const values: T[] = [];
  for (const page of pages) {
    if (page.retryAfterSeconds) throw new Error(`PROVIDER_RATE_LIMIT:${page.retryAfterSeconds}`);
    values.push(...page.values);
    if (!page.cursor) break;
    if (seen.has(page.cursor)) throw new Error("PROVIDER_PAGINATION_LOOP");
    seen.add(page.cursor);
  }
  return values;
}

export interface GitHubDelivery {
  applicationId: string;
  environment: string;
  installationId: string;
  deliveryId: string;
  eventTime: number;
}
export class GitHubInstallationRouter {
  readonly #seen = new Set<string>();
  route(bindings: readonly InstallationBinding[], delivery: GitHubDelivery) {
    const binding = resolveHistoricalInstallation(bindings, delivery);
    const key = `${delivery.installationId}:${delivery.deliveryId}`;
    if (this.#seen.has(key)) throw new Error("GITHUB_DELIVERY_REPLAY");
    this.#seen.add(key);
    return {
      workspaceId: binding.workspaceId,
      connectionId: binding.connectionId,
      bindingVersion: binding.activeFrom
    };
  }
}

export function certifyCollaborationProvider(provider: CollaborationProvider) {
  const manifest = COLLABORATION_PROVIDER_MANIFESTS[provider];
  const receipts: ProviderActionReceipt[] = manifest.actions.map((action, index) => {
    const content = { action, body: escapeProviderText("fixture @everyone <script>") };
    const adapter = new RecordedKnowledgeProvider("notion");
    return adapter.reconcileAction(
      adapter.executeAction({
        provider: "notion",
        connectionId: "fixture",
        accountId: "fixture-account",
        action: "notion.comment.create",
        target: { provider, targetId: String(index) },
        expectedVersion: "0",
        content,
        contentHash: digest(content),
        idempotencyKey: `${provider}:${action}:${index}`,
        approvalId: "fixture-approval",
        risk: "medium",
        responseLost: true
      })
    );
  });
  return {
    provider,
    engineeringStatus: "RECORDED" as const,
    liveStatus: "BLOCKED_EXTERNAL" as const,
    externalGate: COLLABORATION_EXTERNAL_GATES[provider],
    declaredActions: manifest.actions.length,
    declaredObjects: manifest.objectTypes.length,
    reconciled: receipts.every((receipt) => receipt.state === "CONFIRMED"),
    receipts
  };
}
