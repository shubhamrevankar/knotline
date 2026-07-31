import { describe, expect, it } from "vitest";

import { addBusinessMinutes, approvalPolicySchema, evaluateApproval } from "./approval.js";

describe("approval policy contracts", () => {
  const steps = [
    { stepKey: "review", mode: "quorum" as const, quorum: 2, eligibleUserIds: ["a", "b", "c"] }
  ];
  it("evaluates quorum, rejection, and immutable duplicate actors", () => {
    expect(
      evaluateApproval("parallel", steps, [{ stepKey: "review", actorId: "a", outcome: "approve" }])
    ).toBe("pending");
    expect(
      evaluateApproval("parallel", steps, [
        { stepKey: "review", actorId: "a", outcome: "approve" },
        { stepKey: "review", actorId: "b", outcome: "approve" }
      ])
    ).toBe("approved");
    expect(
      evaluateApproval("parallel", steps, [{ stepKey: "review", actorId: "c", outcome: "reject" }])
    ).toBe("rejected");
  });

  it("evaluates any, all, revision, and sequential truth tables", () => {
    const parallel = [
      { stepKey: "any", mode: "any" as const, eligibleUserIds: ["a", "b"] },
      { stepKey: "all", mode: "all" as const, eligibleUserIds: ["a", "b"] }
    ];
    expect(
      evaluateApproval("parallel", parallel, [
        { stepKey: "any", actorId: "a", outcome: "approve" },
        { stepKey: "all", actorId: "a", outcome: "approve" }
      ])
    ).toBe("pending");
    expect(
      evaluateApproval("parallel", parallel, [
        { stepKey: "any", actorId: "a", outcome: "approve" },
        { stepKey: "all", actorId: "a", outcome: "approve" },
        { stepKey: "all", actorId: "b", outcome: "approve" }
      ])
    ).toBe("approved");
    expect(
      evaluateApproval("parallel", parallel, [
        { stepKey: "any", actorId: "a", outcome: "request_changes" }
      ])
    ).toBe("revision_requested");
    expect(
      evaluateApproval("sequential", parallel, [
        { stepKey: "all", actorId: "a", outcome: "approve" },
        { stepKey: "all", actorId: "b", outcome: "approve" }
      ])
    ).toBe("invalid_sequence");
  });

  it("requires a quorum only for quorum steps", () => {
    const base = {
      schemaVersion: 1,
      version: 1,
      strategy: "parallel",
      allowSelfApproval: false,
      separationOfDuties: true,
      reasonRequired: true,
      autoOutcome: "none",
      steps: [
        { key: "review", selector: { type: "role", roles: ["owner"] }, mode: "quorum", order: 0 }
      ]
    };
    expect(approvalPolicySchema.safeParse(base).success).toBe(false);
  });

  it("adds time only inside declared business minutes", () => {
    const result = addBusinessMinutes(new Date("2028-02-28T16:59:00.000Z"), 2, {
      weekdays: [1, 2, 3, 4, 5],
      startHourUtc: 9,
      endHourUtc: 17,
      holidays: ["2028-02-29"]
    });
    expect(result.toISOString()).toBe("2028-03-01T09:01:00.000Z");
  });

  it("uses local business time across a daylight-saving transition", () => {
    const result = addBusinessMinutes(new Date("2028-03-10T21:59:00.000Z"), 2, {
      weekdays: [1, 2, 3, 4, 5],
      startHourUtc: 9,
      endHourUtc: 17,
      holidays: [],
      timeZone: "America/New_York"
    });
    expect(result.toISOString()).toBe("2028-03-13T13:01:00.000Z");
  });
});
