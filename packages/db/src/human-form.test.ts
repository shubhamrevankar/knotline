import { describe, expect, it } from "vitest";

import { normalizeHumanForm } from "./human-form.js";

describe("normalizeHumanForm", () => {
  it("preserves canonical forms", () => {
    const form = {
      schemaVersion: 2,
      title: "Decision",
      fields: [{ key: "approved", label: "Approved", type: "boolean" as const }]
    };

    expect(normalizeHumanForm(form, "ignored")).toEqual(form);
  });

  it("upgrades generated shorthand fields into a valid review form", () => {
    expect(
      normalizeHumanForm(
        { fields: ["owner", "responseTarget", "customerContext", "evidenceComplete"] },
        "standard_review"
      )
    ).toEqual({
      schemaVersion: 1,
      title: "Standard review",
      fields: [
        {
          key: "owner",
          label: "Accountable owner",
          type: "text",
          required: true,
          help: "Enter the person responsible for coordinating this response, including their role."
        },
        {
          key: "response_target",
          label: "Response commitment",
          type: "text",
          required: true,
          help: "State the promised response and recovery timeframes, including update frequency."
        },
        {
          key: "customer_context",
          label: "Customer situation",
          type: "rich_text",
          required: true,
          help: "Summarize who is affected, business impact, urgency, known facts, and open questions."
        },
        {
          key: "evidence_complete",
          label: "Required evidence is complete",
          type: "boolean",
          required: true,
          help: "Confirm only after checking the evidence available in the run."
        }
      ]
    });
  });
});
