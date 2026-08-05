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
          minLength: 8,
          help: "Enter the person responsible for coordinating this response, including their role."
        },
        {
          key: "response_target",
          label: "Response commitment",
          type: "text",
          required: true,
          minLength: 8,
          help: "State the promised response and recovery timeframes, including update frequency."
        },
        {
          key: "customer_context",
          label: "Customer situation",
          type: "rich_text",
          required: true,
          minLength: 8,
          help: "Summarize who is affected, business impact, urgency, known facts, and open questions."
        },
        {
          key: "evidence_complete",
          label: "Required evidence is complete",
          type: "boolean",
          required: true,
          mustBeTrue: true,
          help: "Confirm only after checking the evidence available in the run."
        }
      ]
    });
  });
});

describe("operational form inference", () => {
  it("requires structured recovery execution evidence instead of a generic response", () => {
    const form = normalizeHumanForm(undefined, "execute_and_notify");
    expect(form.fields.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "actions_performed",
        "validation_results",
        "delivery_confirmed",
        "evidence_links"
      ])
    );
    expect(form.fields).not.toContainEqual(expect.objectContaining({ key: "response" }));
  });
});
