import type { ApiEnvelope, Workflow, WorkflowSummary } from "@knotline/contracts";

import { classifyStatus, RequestFailure } from "./query/errors.js";

const configuredApiUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredApiUrl === "string" ? configuredApiUrl : "http://localhost:4100";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new RequestFailure(
      `Request failed with ${response.status}`,
      classifyStatus(response.status),
      response.headers.get("knotline-request-id") ??
        response.headers.get("x-request-id") ??
        undefined
    );
  }
  return (await response.json()) as T;
}

export async function fetchWorkflows(): Promise<WorkflowSummary[]> {
  const response = await request<ApiEnvelope<WorkflowSummary[]>>(
    "/v1/teams/team_northstar/workflows"
  );
  return response.data;
}

export async function fetchWorkflow(id: string): Promise<Workflow> {
  const response = await request<ApiEnvelope<Workflow>>(`/v1/workflows/${id}`);
  return response.data;
}
