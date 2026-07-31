import type { ApiEnvelope, Workflow, WorkflowSummary } from "@knotline/contracts";

import { classifyStatus, RequestFailure } from "./query/errors.js";

const configuredApiUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredApiUrl === "string" ? configuredApiUrl : "http://localhost:4100";
const configuredWorkspaceId: unknown = import.meta.env.VITE_WORKSPACE_ID;
const workspaceId =
  typeof configuredWorkspaceId === "string"
    ? configuredWorkspaceId
    : "10000000-0000-4000-8000-000000000001";

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

async function mutate<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const csrf = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-knotline-csrf="))
    ?.slice("__Host-knotline-csrf=".length);
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => undefined)) as
      { error?: { code?: string; message?: string } } | undefined;
    throw new RequestFailure(
      error?.error?.message ?? `Request failed with ${response.status}`,
      classifyStatus(response.status),
      response.headers.get("knotline-request-id") ??
        response.headers.get("x-request-id") ??
        undefined,
      undefined,
      error?.error?.code
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface MeBootstrap {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly status: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly workspaces: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly role: string;
  }[];
  readonly activeWorkspaceId?: string;
  readonly serverTime: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly current: boolean;
  readonly deviceSummary: string;
  readonly issuedAt: string;
  readonly lastUsedAt: string;
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
  readonly revokedAt?: string;
  readonly revocationReason?: string;
}

export const fetchMeBootstrap = () => request<MeBootstrap>("/v1/me/bootstrap");

export const fetchProfile = async () =>
  (await request<{ readonly data: MeBootstrap["user"] }>("/v1/me")).data;

export const updateProfile = async (input: {
  readonly displayName: string;
  readonly locale: string;
  readonly timezone: string;
}) => (await mutate<{ readonly data: MeBootstrap["user"] }>("/v1/me", "PATCH", input)).data;

export const requestMagicLink = (email: string) =>
  mutate<{ readonly accepted: true }>("/edge/v1/auth/magic-links", "POST", {
    email,
    intent: "login",
    returnTargetId: "workflows"
  });

export const exchangeMagicLink = (token: string, intent = "login") =>
  mutate<{ readonly returnTarget: string }>("/edge/v1/auth/magic-links/exchange", "POST", {
    token,
    intent
  });

export const startGoogle = () =>
  mutate<{ readonly authorizationUrl: string; readonly expiresAt: string }>(
    "/edge/v1/auth/google/authorizations",
    "POST",
    { returnTargetId: "workflows" }
  );

export const exchangeGoogle = (resultHandle: string) =>
  mutate<{ readonly returnTarget: string }>("/edge/v1/auth/google/exchange", "POST", {
    resultHandle
  });

export const fetchSessions = async () =>
  (await request<{ readonly data: readonly SessionSummary[] }>("/v1/auth/sessions")).data;

export const revokeSession = (sessionId: string) =>
  mutate<void>(`/v1/auth/sessions/${encodeURIComponent(sessionId)}`, "DELETE");

export const revokeOtherSessions = () =>
  mutate<{ readonly revoked: number }>("/v1/auth/sessions/revoke-others", "POST");

export const logout = () => mutate<void>("/v1/auth/logout", "POST");

export async function fetchWorkflows(): Promise<WorkflowSummary[]> {
  const response = await request<ApiEnvelope<WorkflowSummary[]>>(
    `/v1/teams/${workspaceId}/workflows`
  );
  return response.data;
}

export async function fetchWorkflow(id: string): Promise<Workflow> {
  const response = await request<ApiEnvelope<Workflow>>(`/v1/workflows/${id}`);
  return response.data;
}
