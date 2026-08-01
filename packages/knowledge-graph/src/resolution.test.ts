import { describe, expect, it } from "vitest";
import {
  boundedTraversal,
  intersectEvidenceAcl,
  resolveEntity,
  stableProviderIdentity
} from "./resolution.js";

describe("knowledge graph invariants", () => {
  it("keeps provider identities deterministic across display-name changes", () => {
    expect(stableProviderIdentity("crm", "P-42")).toBe(stableProviderIdentity("CRM", "P-42"));
  });
  it("matches exact provider IDs and never auto-merges name-only collisions", () => {
    const candidates = [
      {
        id: "a",
        canonicalName: "Alex Kim",
        type: "person",
        providerIdentities: [{ provider: "crm", providerId: "1" }],
        aliases: []
      },
      { id: "b", canonicalName: "Alex Kim", type: "person", providerIdentities: [], aliases: [] }
    ];
    expect(
      resolveEntity(
        { canonicalName: "Renamed", type: "person", provider: "crm", providerId: "1" },
        candidates
      ).decision
    ).toBe("match");
    expect(resolveEntity({ canonicalName: "Alex Kim", type: "person" }, candidates).decision).toBe(
      "review"
    );
  });
  it("intersects mixed visibility instead of broadening access", () => {
    expect(
      intersectEvidenceAcl([
        { principalIds: ["a", "b"], groupIds: ["g"] },
        { principalIds: ["b", "c"], groupIds: [] }
      ])
    ).toEqual({ principalIds: ["b"], groupIds: [] });
  });
  it("bounds cycles, fan-out, depth, and result size", () => {
    const result = boundedTraversal(
      "a",
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { id: "1", sourceId: "a", targetId: "b", type: "knows" },
        { id: "2", sourceId: "b", targetId: "c", type: "knows" },
        { id: "3", sourceId: "c", targetId: "a", type: "knows" }
      ],
      { depth: 4, limit: 2 }
    );
    expect(result.edges).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(() => boundedTraversal("a", [], [], { depth: 5, limit: 2 })).toThrow(
      "GRAPH_QUERY_LIMIT_EXCEEDED"
    );
  });
});
