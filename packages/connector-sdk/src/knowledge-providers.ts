import { createHash } from "node:crypto";
import type { ConnectorManifest } from "@knotline/contracts";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type KnowledgeProvider = "google-workspace" | "notion" | "confluence-cloud";
export type CertificationStatus = "RECORDED" | "LIVE" | "BLOCKED_EXTERNAL";

export interface ProviderSource {
  id: string;
  kind: "drive" | "folder" | "space" | "page" | "database";
  name: string;
  parentId?: string;
  estimatedObjects: number;
  selectable: boolean;
  limitation?: string;
}

export interface SourceSelection {
  mode: "all" | "selected";
  sourceIds: string[];
  include: string[];
  exclude: string[];
}

export interface SourceCoordinate {
  provider: KnowledgeProvider;
  sourceId: string;
  version: string;
  nativeUrl: string;
  path: string;
  sheet?: string;
  range?: string;
  blockId?: string;
}

export interface ExtractedFragment {
  text: string;
  kind: "heading" | "paragraph" | "list" | "table" | "comment" | "cell";
  coordinate: SourceCoordinate;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderPermission {
  subjectType: "user" | "group" | "domain" | "link" | "workspace";
  subjectId: string;
  role: "owner" | "editor" | "commenter" | "viewer";
  inheritedFrom?: string;
}

export interface ProviderChange {
  id: string;
  sequence: number;
  kind: "permission" | "content" | "delete";
  sourceId: string;
  version: string;
  observedAt: string;
}

export interface ProviderActionInput {
  provider: KnowledgeProvider;
  connectionId: string;
  accountId: string;
  action:
    | "drive.file.create"
    | "drive.file.export"
    | "sheets.range.append"
    | "sheets.range.update"
    | "notion.page.create"
    | "notion.page.update"
    | "notion.database-row.upsert"
    | "notion.comment.create"
    | "confluence.page.create"
    | "confluence.page.update"
    | "confluence.comment.create";
  target: Readonly<Record<string, string>>;
  expectedVersion?: string;
  content: unknown;
  contentHash: string;
  idempotencyKey: string;
  approvalId: string;
  risk: "low" | "medium" | "high";
  responseLost?: boolean;
}

export interface ProviderActionReceipt {
  operationId: string;
  state: "CONFIRMED" | "CONFLICT" | "UNCERTAIN";
  providerObjectId?: string;
  providerVersion?: string;
  providerVisibleHash?: string;
  idempotencyKey: string;
  reconciliation: "native-idempotency" | "deterministic-lookup";
  repair?: string;
}

const common = {
  version: "1.0.0",
  authMethods: ["oauth2"] as ConnectorManifest["authMethods"],
  capabilities: [
    "discover",
    "read",
    "write",
    "webhook",
    "poll",
    "permissions",
    "delete",
    "reconcile"
  ] as ConnectorManifest["capabilities"],
  permissionFidelity: "exact" as const,
  regions: ["us", "eu", "in"],
  rateLimits: { concurrency: 4, requestsPerMinute: 240 }
};

export const KNOWLEDGE_PROVIDER_MANIFESTS: Readonly<Record<KnowledgeProvider, ConnectorManifest>> =
  {
    "google-workspace": {
      ...common,
      key: "google-workspace-knowledge",
      displayName: "Google Workspace knowledge",
      provider: "google",
      requiredScopes: ["drive.metadata.readonly", "drive.readonly"],
      optionalScopes: ["drive.file", "documents.readonly", "spreadsheets"],
      objectTypes: ["drive", "folder", "shortcut", "file", "document", "spreadsheet"],
      triggers: ["drive.object.changed", "drive.permission.changed"],
      actions: [
        "drive.file.create",
        "drive.file.export",
        "sheets.range.append",
        "sheets.range.update"
      ],
      webhookMode: "connection",
      oauth: {
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token"
      }
    },
    notion: {
      ...common,
      key: "notion-knowledge",
      displayName: "Notion knowledge",
      provider: "notion",
      requiredScopes: ["read_content", "read_user_information"],
      optionalScopes: ["insert_content", "update_content", "read_comments", "insert_comments"],
      objectTypes: ["page", "database", "data-source", "database-row", "block", "comment"],
      triggers: ["notion.object.changed", "notion.permission.changed"],
      actions: [
        "notion.page.create",
        "notion.page.update",
        "notion.database-row.upsert",
        "notion.comment.create"
      ],
      webhookMode: "connection",
      oauth: {
        authorizationEndpoint: "https://api.notion.com/v1/oauth/authorize",
        tokenEndpoint: "https://api.notion.com/v1/oauth/token"
      }
    },
    "confluence-cloud": {
      ...common,
      key: "confluence-cloud-knowledge",
      displayName: "Confluence Cloud knowledge",
      provider: "atlassian",
      requiredScopes: ["read:content:confluence", "read:space:confluence"],
      optionalScopes: [
        "read:comment:confluence",
        "read:attachment:confluence",
        "write:page:confluence",
        "write:comment:confluence"
      ],
      objectTypes: ["space", "page", "blog-post", "attachment", "comment"],
      triggers: ["confluence.content.changed", "confluence.restriction.changed"],
      actions: ["confluence.page.create", "confluence.page.update", "confluence.comment.create"],
      webhookMode: "application",
      oauth: {
        authorizationEndpoint: "https://auth.atlassian.com/authorize",
        tokenEndpoint: "https://auth.atlassian.com/oauth/token"
      }
    }
  };

export const PROVIDER_CAPABILITY_STATUS = {
  "google-workspace": {
    engineering: "RECORDED" as CertificationStatus,
    live: "BLOCKED_EXTERNAL" as CertificationStatus,
    externalGate: "EXT-007",
    limitations: ["Live OAuth application and provider sandbox certification are not configured."]
  },
  notion: {
    engineering: "RECORDED" as CertificationStatus,
    live: "BLOCKED_EXTERNAL" as CertificationStatus,
    externalGate: "EXT-009",
    limitations: ["Only pages explicitly shared with the integration can be synchronized."]
  },
  "confluence-cloud": {
    engineering: "RECORDED" as CertificationStatus,
    live: "BLOCKED_EXTERNAL" as CertificationStatus,
    externalGate: "EXT-009",
    limitations: ["Confluence Data Center is unsupported until separately version-certified."]
  }
} as const;

const normalizeRule = (value: string) => value.trim().replaceAll(/\*+/gu, "*");
const glob = (value: string, pattern: string) => {
  const escaped = normalizeRule(pattern)
    .replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "iu").test(value);
};

export function validateSourceSelection(
  available: readonly ProviderSource[],
  input: SourceSelection
) {
  const ids = new Set(available.filter((source) => source.selectable).map((source) => source.id));
  const sourceIds = [...new Set(input.sourceIds)];
  if (input.mode === "selected" && sourceIds.length === 0)
    throw new Error("SOURCE_SELECTION_EMPTY");
  if (sourceIds.some((id) => !ids.has(id))) throw new Error("SOURCE_SELECTION_UNAVAILABLE");
  if (input.include.length + input.exclude.length > 100) throw new Error("SOURCE_RULE_LIMIT");
  return {
    ...input,
    sourceIds,
    include: [...new Set(input.include.map(normalizeRule).filter(Boolean))],
    exclude: [...new Set(input.exclude.map(normalizeRule).filter(Boolean))],
    estimatedObjects: available
      .filter((source) => input.mode === "all" || sourceIds.includes(source.id))
      .reduce((total, source) => total + source.estimatedObjects, 0)
  };
}

export function sourceSelected(path: string, selection: SourceSelection) {
  const included =
    selection.include.length === 0 || selection.include.some((rule) => glob(path, rule));
  return included && !selection.exclude.some((rule) => glob(path, rule));
}

type GoogleDocElement =
  | { type: "heading" | "paragraph" | "list"; text: string; index: number; level?: number }
  | { type: "table"; rows: string[][]; index: number }
  | { type: "comment"; text: string; index: number; authorized: boolean };

export function extractGoogleDocument(input: {
  id: string;
  revision: string;
  url: string;
  elements: readonly GoogleDocElement[];
}) {
  return input.elements.flatMap<ExtractedFragment>((element) => {
    if (element.type === "comment" && !element.authorized) return [];
    const text =
      element.type === "table"
        ? element.rows.map((row) => row.join(" | ")).join("\n")
        : element.text;
    return [
      {
        text,
        kind: element.type,
        coordinate: {
          provider: "google-workspace",
          sourceId: input.id,
          version: input.revision,
          nativeUrl: input.url,
          path: `body/${element.index}`
        },
        ...(element.type === "heading" ? { metadata: { level: element.level ?? 1 } } : {})
      }
    ];
  });
}

export function extractGoogleSheet(input: {
  id: string;
  revision: string;
  url: string;
  sheets: readonly {
    name: string;
    hidden?: boolean;
    protected?: boolean;
    rows: readonly (readonly { value: string; formula?: string }[])[];
  }[];
  includeFormulas: boolean;
  maxCells?: number;
}) {
  const limit = input.maxCells ?? 50_000;
  const fragments: ExtractedFragment[] = [];
  for (const sheet of input.sheets) {
    if (sheet.hidden || sheet.protected) continue;
    for (const [rowIndex, row] of sheet.rows.entries())
      for (const [columnIndex, cell] of row.entries()) {
        if (fragments.length >= limit) throw new Error("SHEET_SIZE_LIMIT");
        const column = String.fromCharCode(65 + columnIndex);
        const range = `${column}${rowIndex + 1}`;
        fragments.push({
          text: cell.value,
          kind: "cell",
          coordinate: {
            provider: "google-workspace",
            sourceId: input.id,
            version: input.revision,
            nativeUrl: `${input.url}#gid=${encodeURIComponent(sheet.name)}&range=${range}`,
            path: `sheets/${sheet.name}/${range}`,
            sheet: sheet.name,
            range
          },
          ...(input.includeFormulas && cell.formula ? { metadata: { formula: cell.formula } } : {})
        });
      }
  }
  return fragments;
}

export interface NotionBlock {
  id: string;
  type: "heading" | "paragraph" | "list" | "table" | "comment";
  text: string;
  children?: readonly NotionBlock[];
  authorized?: boolean;
}
export function extractNotionPage(input: {
  id: string;
  version: string;
  url: string;
  properties: Readonly<Record<string, unknown>>;
  blocks: readonly NotionBlock[];
}) {
  const fragments: ExtractedFragment[] = [];
  const visit = (blocks: readonly NotionBlock[], path: string) => {
    for (const block of blocks) {
      if (block.type !== "comment" || block.authorized)
        fragments.push({
          text: block.text,
          kind: block.type,
          coordinate: {
            provider: "notion",
            sourceId: input.id,
            version: input.version,
            nativeUrl: `${input.url}#${block.id}`,
            path: `${path}/${block.id}`,
            blockId: block.id
          },
          ...(path === "blocks" ? { metadata: input.properties } : {})
        });
      if (block.children) visit(block.children, `${path}/${block.id}/children`);
    }
  };
  visit(input.blocks, "blocks");
  return fragments;
}

export const sanitizeProviderHtml = (html: string) =>
  html
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replaceAll(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replaceAll(/\s(?:src|href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/giu, "")
    .replaceAll(
      /<(?:iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form)>/giu,
      ""
    );

export function extractConfluenceContent(input: {
  id: string;
  version: string;
  url: string;
  storageHtml: string;
  labels: readonly string[];
}) {
  const sanitized = sanitizeProviderHtml(input.storageHtml);
  const text = sanitized
    .replaceAll(/<br\s*\/?\s*>/giu, "\n")
    .replaceAll(/<\/p>|<\/li>|<\/h[1-6]>|<\/tr>/giu, "\n")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/&lt;/gu, "<")
    .replaceAll(/&gt;/gu, ">")
    .replaceAll(/&amp;/gu, "&")
    .replaceAll(/[ \t]+/gu, " ")
    .replaceAll(/\n\s+/gu, "\n")
    .trim();
  return {
    sanitizedHtml: sanitized,
    fragment: {
      text,
      kind: "paragraph" as const,
      coordinate: {
        provider: "confluence-cloud" as const,
        sourceId: input.id,
        version: input.version,
        nativeUrl: input.url,
        path: `content/version/${input.version}`
      },
      metadata: { labels: input.labels }
    }
  };
}

export const permissionHash = (permissions: readonly ProviderPermission[]) =>
  digest(
    [...permissions].sort((left, right) =>
      `${left.subjectType}:${left.subjectId}:${left.role}`.localeCompare(
        `${right.subjectType}:${right.subjectId}:${right.role}`
      )
    )
  );

export const prioritizeProviderChanges = (changes: readonly ProviderChange[]) =>
  [...changes].sort(
    (left, right) =>
      Number(right.kind === "permission" || right.kind === "delete") -
        Number(left.kind === "permission" || left.kind === "delete") ||
      left.sequence - right.sequence
  );

export class RecordedKnowledgeProvider {
  readonly #objects = new Map<string, { version: number; content: unknown; hash: string }>();
  readonly #operations = new Map<string, ProviderActionReceipt>();
  constructor(readonly provider: KnowledgeProvider) {}

  executeAction(input: ProviderActionInput): ProviderActionReceipt {
    if (input.provider !== this.provider) throw new Error("ACTION_PROVIDER_MISMATCH");
    if (digest(input.content) !== input.contentHash)
      throw new Error("ACTION_CONTENT_HASH_MISMATCH");
    if (!input.approvalId) throw new Error("ACTION_APPROVAL_REQUIRED");
    const duplicate = this.#operations.get(input.idempotencyKey);
    if (duplicate) return duplicate;
    const targetId = Object.values(input.target).join(":") || digest(input.target).slice(0, 16);
    const current = this.#objects.get(targetId);
    if (
      input.expectedVersion !== undefined &&
      String(current?.version ?? 0) !== input.expectedVersion
    ) {
      const conflict: ProviderActionReceipt = {
        operationId: digest(input.idempotencyKey).slice(0, 24),
        state: "CONFLICT",
        idempotencyKey: input.idempotencyKey,
        reconciliation: this.provider === "notion" ? "deterministic-lookup" : "native-idempotency",
        repair: "Refresh the target version and request approval for the updated diff."
      };
      this.#operations.set(input.idempotencyKey, conflict);
      return conflict;
    }
    const version = (current?.version ?? 0) + 1;
    this.#objects.set(targetId, { version, content: input.content, hash: input.contentHash });
    const receipt: ProviderActionReceipt = {
      operationId: digest(input.idempotencyKey).slice(0, 24),
      state: input.responseLost ? "UNCERTAIN" : "CONFIRMED",
      providerObjectId: targetId,
      providerVersion: String(version),
      idempotencyKey: input.idempotencyKey,
      reconciliation: this.provider === "notion" ? "deterministic-lookup" : "native-idempotency",
      ...(input.responseLost
        ? { repair: "Reconcile by target and content hash before retrying." }
        : { providerVisibleHash: input.contentHash })
    };
    this.#operations.set(input.idempotencyKey, receipt);
    return receipt;
  }

  reconcileAction(receipt: ProviderActionReceipt): ProviderActionReceipt {
    if (receipt.state !== "UNCERTAIN" || !receipt.providerObjectId) return receipt;
    const object = this.#objects.get(receipt.providerObjectId);
    const confirmed: ProviderActionReceipt = { ...receipt };
    delete confirmed.repair;
    const reconciled = object
      ? {
          ...confirmed,
          state: "CONFIRMED" as const,
          providerVisibleHash: object.hash
        }
      : {
          ...receipt,
          state: "UNCERTAIN" as const,
          repair: "Escalate for provider-side inspection."
        };
    this.#operations.set(receipt.idempotencyKey, reconciled);
    return reconciled;
  }

  visibleObject(id: string) {
    return this.#objects.get(id);
  }
}

export function certifyKnowledgeProvider(provider: KnowledgeProvider) {
  const manifest = KNOWLEDGE_PROVIDER_MANIFESTS[provider];
  const adapter = new RecordedKnowledgeProvider(provider);
  const receipts = manifest.actions.map((action, index) => {
    const content = { text: "certified fixture write", action };
    const input: ProviderActionInput = {
      provider,
      connectionId: "fixture-connection",
      accountId: "fixture-account",
      action: action as ProviderActionInput["action"],
      target: { sourceId: `fixture-source-${index}` },
      expectedVersion: "0",
      content,
      contentHash: digest(content),
      idempotencyKey: `${provider}-certification-${index}`,
      approvalId: "fixture-approval",
      risk: "medium",
      responseLost: true
    };
    return adapter.reconcileAction(adapter.executeAction(input));
  });
  return {
    provider,
    manifestVersion: manifest.version,
    engineeringStatus: "RECORDED" as const,
    liveStatus: "BLOCKED_EXTERNAL" as const,
    actionCount: manifest.actions.length,
    readTypes: manifest.objectTypes,
    uncertainObserved: receipts.length > 0,
    reconciled: receipts.every((receipt) => receipt.state === "CONFIRMED"),
    receipts
  };
}
