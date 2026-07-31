export const ANALYTICS_EVENTS = [
  "public.route.viewed",
  "public.cta.activated",
  "shell.navigation.activated",
  "shell.command.opened",
  "consent.preference.changed"
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsEnvelope {
  readonly event: AnalyticsEvent;
  readonly routeId: string;
  readonly surface: "customer" | "operator" | "public";
  readonly controlId?: string;
  readonly occurredAt: string;
}

export function analyticsEnvelope(
  input: Omit<AnalyticsEnvelope, "occurredAt">,
  now: Date = new Date()
): AnalyticsEnvelope {
  return { ...input, occurredAt: now.toISOString() };
}

export function containsCustomerContent(value: AnalyticsEnvelope): boolean {
  const allowed = new Set(["event", "routeId", "surface", "controlId", "occurredAt"]);
  return Object.keys(value).some((key) => !allowed.has(key));
}
