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
        { key: "owner", label: "Owner", type: "text", required: true },
        {
          key: "response_target",
          label: "Response Target",
          type: "text",
          required: true
        },
        {
          key: "customer_context",
          label: "Customer Context",
          type: "rich_text",
          required: true
        },
        {
          key: "evidence_complete",
          label: "Evidence Complete",
          type: "boolean",
          required: true
        }
      ]
    });
  });
});
