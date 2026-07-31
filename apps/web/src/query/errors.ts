export type FailureKind =
  | "authentication"
  | "authorization"
  | "conflict"
  | "network"
  | "not-found"
  | "rate-limit"
  | "server"
  | "validation";

export class RequestFailure extends Error {
  override readonly name = "RequestFailure";

  constructor(
    message: string,
    readonly kind: FailureKind,
    readonly requestId?: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
  }
}

export function classifyStatus(status: number): FailureKind {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404 || status === 410) return "not-found";
  if (status === 409 || status === 412) return "conflict";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "server";
  return "validation";
}

export function mayRetry(failure: unknown, attempt: number): boolean {
  if (attempt >= 2) return false;
  if (!(failure instanceof RequestFailure)) return false;
  return ["network", "rate-limit", "server"].includes(failure.kind);
}
