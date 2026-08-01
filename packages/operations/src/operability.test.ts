import { describe, expect, it } from "vitest";
import {
  authorizeRepair,
  breakGlassDecision,
  burnRate,
  evaluateKillSwitch
} from "./operability.js";
describe("operability", () => {
  it("applies exact and global kill switches with expiry", () => {
    const now = 1000;
    expect(
      evaluateKillSwitch(
        [
          {
            scope: "connector",
            target: "c1",
            enabled: true,
            inFlight: "quarantine",
            reason: "storm",
            expiresAt: 2000
          }
        ],
        "connector",
        "c1",
        now
      )?.inFlight
    ).toBe("quarantine");
    expect(
      evaluateKillSwitch(
        [
          {
            scope: "global",
            target: "*",
            enabled: true,
            inFlight: "finish",
            reason: "incident",
            expiresAt: 500
          }
        ],
        "tool",
        "t",
        now
      )
    ).toBeNull();
  });
  it("calculates objective burn", () => {
    expect(burnRate(990, 1000, 0.99).burn).toBeCloseTo(1);
  });
  it("requires preview confirmation reason idempotency and recent step-up", () => {
    expect(
      authorizeRepair({
        previewed: true,
        confirmed: true,
        stepUpAgeMs: 1000,
        reason: "INC-1 repair",
        idempotencyKey: "k",
        risk: "high"
      }).allowed
    ).toBe(true);
    expect(
      authorizeRepair({
        previewed: false,
        confirmed: true,
        stepUpAgeMs: 1000,
        reason: "INC-1 repair",
        idempotencyKey: "k",
        risk: "high"
      }).allowed
    ).toBe(false);
  });
  it("enforces dual-control break glass", () => {
    expect(
      breakGlassDecision({
        ticket: "INC-1",
        approvers: ["a", "b"],
        hardwareStepUpAgeMs: 1000,
        durationMinutes: 30,
        scope: ["runtime:read"]
      })
    ).toBe(true);
    expect(
      breakGlassDecision({
        ticket: "INC-1",
        approvers: ["a", "a"],
        hardwareStepUpAgeMs: 1000,
        durationMinutes: 30,
        scope: ["runtime:read"]
      })
    ).toBe(false);
  });
});
