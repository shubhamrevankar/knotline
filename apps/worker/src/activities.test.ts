import { describe, expect, it } from "vitest";

import { executeTransformMapping } from "./activities.js";

describe("transform execution", () => {
  it("maps typed run input and dependency outputs without evaluating arbitrary code", () => {
    expect(
      executeTransformMapping(
        {
          caseId: "${input.caseId}",
          impact: "${nodes.classify.output.impact}",
          title: "Case ${input.caseId}",
          optional: "${input.missing}"
        },
        {
          input: { caseId: "case-42" },
          nodes: { classify: { output: { impact: 91 } } }
        },
        true
      )
    ).toEqual({ caseId: "case-42", impact: 91, title: "Case case-42" });
  });

  it("rejects a missing mapping instead of pretending a transform succeeded", () => {
    expect(() => executeTransformMapping(undefined, { input: {}, nodes: {} }, false)).toThrow(
      "TRANSFORM_MAPPING_REQUIRED"
    );
  });
});
