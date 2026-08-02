import type { SearchResult } from "./api.js";

const detailRoutes: Readonly<Record<string, string>> = {
  agent: "/app/agents",
  approval: "/app/approvals",
  connection: "/app/connections",
  document: "/app/knowledge/documents",
  run: "/app/runs",
  task: "/app/tasks",
  workflow: "/app/workflows"
};

const collectionRoutes: Readonly<Record<string, string>> = {
  comment: "/app/inbox",
  knowledge: "/app/knowledge/search",
  member: "/app/settings/members",
  person: "/app/settings/members",
  setting: "/app/settings/workspace"
};

export const searchResultPath = (result: SearchResult) => {
  const type = result.resourceType.toLowerCase();
  const detail = detailRoutes[type];
  if (detail) return `${detail}/${encodeURIComponent(result.resourceId)}`;
  return collectionRoutes[type] ?? "/app/search";
};

export const searchResultTitle = (result: SearchResult, fallback = "Authorized resource") => {
  const value = result.fields.title ?? result.fields.name;
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
};

export const searchResultSummary = (
  result: SearchResult,
  fallback = "Open this resource to view its authorized fields."
) => {
  const value = result.fields.summary ?? result.fields.description;
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
};

export const searchResultTypeLabel = (type: string) => {
  const normalized = type.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
