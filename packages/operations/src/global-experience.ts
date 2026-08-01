const SENSITIVE_PATH = /(?:approval|credential|token|secret|billing|guest-session)/iu;
export function classifyOfflineRequest(method: string, path: string) {
  if (method !== "GET") return "network_only" as const;
  if (SENSITIVE_PATH.test(path) || path.startsWith("/v1/")) return "network_only" as const;
  if (["/", "/help", "/status", "/accessibility", "/legal/privacy", "/legal/terms"].includes(path))
    return "public_shell" as const;
  return "network_first" as const;
}
export function contactRisk(input: { email: string; message: string; honeypot?: string }) {
  if (input.honeypot) return { accepted: false, reason: "bot" } as const;
  if (input.message.length < 10 || input.message.length > 5000)
    return { accepted: false, reason: "length" } as const;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(input.email))
    return { accepted: false, reason: "email" } as const;
  return { accepted: true, reason: "accepted" } as const;
}
export function guestScopeAllows(scope: readonly string[], action: string, resourceId: string) {
  return scope.includes(`${action}:${resourceId}`);
}
