import { describe, expect, it } from "vitest";

import {
  changedWorkflowSections,
  mergeChangedSections,
  renderSafeMarkdown
} from "./collaboration.js";

describe("safe collaboration content", () => {
  it("renders the bounded Markdown subset while neutralizing XSS and unsafe URLs", () => {
    const rendered = renderSafeMarkdown(
      "**Review** <script>alert(1)</script> [safe](https://example.test) [bad](javascript:alert(1))"
    );
    expect(rendered).toContain("<strong>Review</strong>");
    expect(rendered).toContain('href="https://example.test"');
    expect(rendered).toContain("&lt;script&gt;");
    expect(rendered).not.toContain('href="javascript:');
  });

  it("returns deterministic changed sections for compare/reapply", () => {
    expect(
      changedWorkflowSections(
        { name: "Before", nodes: [], edges: [] },
        { name: "After", nodes: [{ key: "one" }], edges: [] }
      )
    ).toEqual(["name", "nodes"]);
  });

  it("three-way reapplies independent edits and reports overlapping conflicts", () => {
    const base = { name: "Before", description: "Base", nodes: [] };
    expect(
      mergeChangedSections(base, { ...base, name: "Local" }, { ...base, description: "Remote" })
    ).toEqual({
      merged: { name: "Local", description: "Remote", nodes: [] },
      conflicts: [],
      reapplied: ["name"]
    });
    expect(
      mergeChangedSections(base, { ...base, name: "Local" }, { ...base, name: "Remote" }).conflicts
    ).toEqual(["name"]);
  });
});
