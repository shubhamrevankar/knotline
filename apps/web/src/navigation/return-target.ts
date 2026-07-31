const SENSITIVE_PARAMETERS = new Set([
  "access_token",
  "auth",
  "code",
  "id_token",
  "password",
  "secret",
  "session",
  "token"
]);

export function safeReturnTarget(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  let target: URL;
  try {
    target = new URL(value, "https://knotline.invalid");
  } catch {
    return fallback;
  }
  if (target.origin !== "https://knotline.invalid") return fallback;
  for (const name of [...target.searchParams.keys()]) {
    if (SENSITIVE_PARAMETERS.has(name.toLowerCase())) target.searchParams.delete(name);
  }
  return `${target.pathname}${target.search}${target.hash}`;
}
