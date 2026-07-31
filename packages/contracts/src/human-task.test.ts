import { describe, expect, it } from "vitest";
import { humanFormSchema, validateHumanSubmission, visibleHumanFields } from "./human-task.js";

const form = humanFormSchema.parse({
  schemaVersion: 1,
  title: "Review",
  fields: [
    {
      key: "decision",
      label: "Decision",
      type: "choice",
      required: true,
      options: [
        { value: "approve", label: "Approve" },
        { value: "return", label: "Return" }
      ]
    },
    {
      key: "reason",
      label: "Reason",
      type: "text",
      required: true,
      visibleWhen: { field: "decision", equals: "return" }
    },
    { key: "amount", label: "Amount", type: "number" }
  ]
});

describe("human task forms", () => {
  it("renders conditional fields deterministically", () => {
    expect(visibleHumanFields(form, { decision: "approve" }).map(({ key }) => key)).toEqual([
      "decision",
      "amount"
    ]);
    expect(visibleHumanFields(form, { decision: "return" }).map(({ key }) => key)).toEqual([
      "decision",
      "reason",
      "amount"
    ]);
  });
  it("validates required and typed values without coercing decisions", () => {
    expect(validateHumanSubmission(form, { decision: "return", amount: "12" })).toEqual({
      reason: "REQUIRED",
      amount: "NUMBER_REQUIRED"
    });
    expect(
      validateHumanSubmission(form, { decision: "return", reason: "Missing data", amount: 12 })
    ).toEqual({});
  });
  it("rejects duplicate and malformed choice schemas", () => {
    expect(() =>
      humanFormSchema.parse({
        schemaVersion: 1,
        title: "Bad",
        fields: [{ key: "x", label: "X", type: "choice" }]
      })
    ).toThrow();
  });
});
