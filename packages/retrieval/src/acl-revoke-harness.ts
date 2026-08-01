export const ACL_REVOKE_CASES = [
  "local-commit",
  "provider-webhook",
  "provider-poll",
  "provider-backlog",
  "cached-result",
  "open-session",
  "citation-open",
  "entity-materialization",
  "prepared-agent-context"
] as const;

export type AclRevokeCase = (typeof ACL_REVOKE_CASES)[number];

export interface AclRevokeAdapter {
  readonly name: string;
  readonly supportedCases: readonly AclRevokeCase[];
  seed(): Promise<void>;
  revoke(
    testCase: AclRevokeCase
  ): Promise<{ committedAt: number; deniedAt: number; leakedMetadata: readonly string[] }>;
}

export async function runAclRevokeHarness(adapter: AclRevokeAdapter) {
  await adapter.seed();
  const results = [];
  for (const testCase of adapter.supportedCases) {
    const result = await adapter.revoke(testCase);
    const latencyMs = result.deniedAt - result.committedAt;
    const local = adapter.name === "local-file";
    results.push({ testCase, latencyMs, leakedMetadata: result.leakedMetadata });
    if (latencyMs < 0 || (local ? latencyMs > 1 : latencyMs > 300_000))
      throw new Error(`ACL_REVOKE_LATENCY:${testCase}`);
    if (result.leakedMetadata.length) throw new Error(`ACL_REVOKE_METADATA_LEAK:${testCase}`);
  }
  return results;
}
