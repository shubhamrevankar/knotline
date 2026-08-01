export type KillScope =
  "global" | "workspace" | "workflow" | "agent" | "connector" | "tool" | "trigger" | "provider";
export interface KillSwitch {
  readonly scope: KillScope;
  readonly target: string;
  readonly enabled: boolean;
  readonly inFlight: "finish" | "cancel" | "quarantine";
  readonly reason: string;
  readonly expiresAt: number;
}
export function evaluateKillSwitch(
  switches: readonly KillSwitch[],
  scope: KillScope,
  target: string,
  now = Date.now()
) {
  return (
    switches.find(
      (item) =>
        item.enabled &&
        item.expiresAt > now &&
        (item.scope === "global" || (item.scope === scope && item.target === target))
    ) ?? null
  );
}
export function burnRate(good: number, total: number, target: number) {
  if (total <= 0) return { availability: 1, burn: 0 };
  const availability = good / total,
    errorBudget = 1 - target;
  return { availability, burn: errorBudget === 0 ? Infinity : (1 - availability) / errorBudget };
}
export function authorizeRepair(input: {
  previewed: boolean;
  confirmed: boolean;
  stepUpAgeMs: number;
  reason: string;
  idempotencyKey: string;
  risk: "low" | "high";
}) {
  if (!input.previewed) return { allowed: false, reason: "preview_required" } as const;
  if (!input.confirmed) return { allowed: false, reason: "confirmation_required" } as const;
  if (input.reason.length < 8) return { allowed: false, reason: "reason_required" } as const;
  if (!input.idempotencyKey) return { allowed: false, reason: "idempotency_required" } as const;
  if (input.risk === "high" && input.stepUpAgeMs > 5 * 60_000)
    return { allowed: false, reason: "step_up_required" } as const;
  return { allowed: true, reason: "allowed" } as const;
}
export function breakGlassDecision(input: {
  ticket: string;
  approvers: readonly string[];
  hardwareStepUpAgeMs: number;
  durationMinutes: number;
  scope: readonly string[];
}) {
  const independent = new Set(input.approvers);
  return (
    input.ticket.length > 0 &&
    independent.size >= 2 &&
    input.hardwareStepUpAgeMs <= 5 * 60_000 &&
    input.durationMinutes > 0 &&
    input.durationMinutes <= 30 &&
    input.scope.length > 0
  );
}
