import { createHash } from "node:crypto";

export interface ResolutionCandidate {
  readonly id: string;
  readonly canonicalName: string;
  readonly type: string;
  readonly providerIdentities: readonly { provider: string; providerId: string }[];
  readonly aliases: readonly string[];
}

export interface ResolutionInput {
  readonly canonicalName: string;
  readonly type: string;
  readonly provider?: string;
  readonly providerId?: string;
  readonly aliases?: readonly string[];
}

export const normalizeIdentity = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");

export const stableProviderIdentity = (provider: string, providerId: string) =>
  `pid_${createHash("sha256")
    .update(`${normalizeIdentity(provider)}\0${providerId.normalize("NFKC")}`)
    .digest("hex")}`;

function tokenSimilarity(left: string, right: string) {
  const a = new Set(
    normalizeIdentity(left)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
  const b = new Set(
    normalizeIdentity(right)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function resolveEntity(input: ResolutionInput, candidates: readonly ResolutionCandidate[]) {
  if (input.provider && input.providerId) {
    const exact = candidates.find((candidate) =>
      candidate.providerIdentities.some(
        (identity) =>
          normalizeIdentity(identity.provider) === normalizeIdentity(input.provider!) &&
          identity.providerId === input.providerId
      )
    );
    if (exact)
      return { decision: "match" as const, entityId: exact.id, score: 1, reason: "provider_id" };
  }
  const scored = candidates
    .filter((candidate) => candidate.type === input.type)
    .map((candidate) => {
      const names = [candidate.canonicalName, ...candidate.aliases];
      const incoming = [input.canonicalName, ...(input.aliases ?? [])];
      const score = Math.max(
        ...names.flatMap((name) => incoming.map((value) => tokenSimilarity(name, value)))
      );
      return { candidate, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.candidate.id.localeCompare(right.candidate.id)
    );
  const [first, second] = scored;
  if (!first || first.score < 0.72)
    return { decision: "create" as const, score: first?.score ?? 0, reason: "below_threshold" };
  if (second && first.score - second.score < 0.08)
    return {
      decision: "review" as const,
      candidates: [first.candidate.id, second.candidate.id],
      score: first.score,
      reason: "collision"
    };
  return {
    decision: "review" as const,
    candidates: [first.candidate.id],
    score: first.score,
    reason: "name_only"
  };
}

export function intersectEvidenceAcl(
  evidence: readonly { principalIds: readonly string[]; groupIds: readonly string[] }[]
) {
  if (!evidence.length) return { principalIds: [], groupIds: [] };
  const intersection = (key: "principalIds" | "groupIds") =>
    evidence
      .slice(1)
      .reduce(
        (current, item) => current.filter((id) => item[key].includes(id)),
        [...evidence[0]![key]]
      );
  return { principalIds: intersection("principalIds"), groupIds: intersection("groupIds") };
}

export interface GraphNode {
  readonly id: string;
}
export interface GraphEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type: string;
}
export function boundedTraversal(
  rootId: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  options: {
    depth: number;
    limit: number;
    relationTypes?: readonly string[];
    maximumFanout?: number;
  }
) {
  if (options.depth > 4 || options.limit > 200) throw new Error("GRAPH_QUERY_LIMIT_EXCEEDED");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set([rootId]);
  let frontier = [rootId];
  const selectedEdges: GraphEdge[] = [];
  for (let depth = 0; depth < options.depth && frontier.length; depth += 1) {
    const next: string[] = [];
    for (const entityId of frontier) {
      const adjacent = edges
        .filter(
          (edge) =>
            (edge.sourceId === entityId || edge.targetId === entityId) &&
            (!options.relationTypes?.length || options.relationTypes.includes(edge.type))
        )
        .slice(0, options.maximumFanout ?? 40);
      for (const edge of adjacent) {
        if (selectedEdges.length >= options.limit) break;
        if (!selectedEdges.some((item) => item.id === edge.id)) selectedEdges.push(edge);
        const nextId = edge.sourceId === entityId ? edge.targetId : edge.sourceId;
        if (!visited.has(nextId) && byId.has(nextId)) {
          visited.add(nextId);
          next.push(nextId);
        }
      }
    }
    frontier = next;
  }
  return {
    nodes: [...visited].map((id) => byId.get(id)!).filter(Boolean),
    edges: selectedEdges,
    truncated: selectedEdges.length >= options.limit
  };
}
