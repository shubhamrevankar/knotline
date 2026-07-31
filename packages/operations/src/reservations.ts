export type ReservationKind = "usage" | "spend";
export type ReservationDenialReason =
  "limit_exceeded" | "control_unavailable" | "invalid_request" | "duplicate_conflict";

export interface UsageSpendReservationRequest {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly kind: ReservationKind;
  readonly meter: string;
  readonly amount: number;
  readonly currency?: string;
  readonly leaseSeconds: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AcceptedReservation {
  readonly accepted: true;
  readonly reservationId: string;
  readonly fencingToken: string;
  readonly reservedAmount: number;
  readonly expiresAt: string;
}

export interface DeniedReservation {
  readonly accepted: false;
  readonly reason: ReservationDenialReason;
  readonly retryable: boolean;
}

export type ReservationDecision = AcceptedReservation | DeniedReservation;

export interface ReservationCommit {
  readonly reservationId: string;
  readonly fencingToken: string;
  readonly actualAmount: number;
  readonly idempotencyKey: string;
}

export interface ReservationRelease {
  readonly reservationId: string;
  readonly fencingToken: string;
  readonly idempotencyKey: string;
  readonly reason: "cancelled" | "failed" | "unused" | "expired";
}

export interface ReservationRenewal {
  readonly reservationId: string;
  readonly fencingToken: string;
  readonly leaseSeconds: number;
}

export interface UsageSpendReservationPort {
  reserve(request: UsageSpendReservationRequest): Promise<ReservationDecision>;
  commit(request: ReservationCommit): Promise<void>;
  release(request: ReservationRelease): Promise<void>;
  renew(request: ReservationRenewal): Promise<AcceptedReservation>;
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const METER = /^[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+$/;

export function assertReservationRequest(request: UsageSpendReservationRequest): void {
  for (const [field, value] of [
    ["operationId", request.operationId],
    ["idempotencyKey", request.idempotencyKey],
    ["workspaceId", request.workspaceId]
  ] as const) {
    if (!TOKEN.test(value)) throw new Error(`Invalid reservation ${field}`);
  }
  if (!METER.test(request.meter)) throw new Error(`Invalid reservation meter: ${request.meter}`);
  if (!Number.isSafeInteger(request.amount) || request.amount <= 0) {
    throw new Error("Reservation amount must be a positive safe integer");
  }
  if (
    !Number.isInteger(request.leaseSeconds) ||
    request.leaseSeconds < 1 ||
    request.leaseSeconds > 3600
  ) {
    throw new Error("Reservation leaseSeconds must be from 1 to 3600");
  }
  if (request.kind === "spend" && !/^[A-Z]{3}$/.test(request.currency ?? "")) {
    throw new Error("Spend reservations require an ISO-style three-letter currency");
  }
  if (request.kind === "usage" && request.currency !== undefined) {
    throw new Error("Usage reservations cannot declare currency");
  }
}
