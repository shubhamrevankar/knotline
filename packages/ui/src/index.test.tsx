import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, Button, Dialog, Input, Pagination, Tabs } from "./index.js";

describe("accessible UI primitives", () => {
  it("renders labeled fields and semantic state", () => {
    const markup = renderToStaticMarkup(
      <>
        <Input label="Workflow name" description="Visible to collaborators" required />
        <Badge tone="success">Verified</Badge>
      </>
    );
    expect(markup).toContain("<label");
    expect(markup).toContain("required");
    expect(markup).toContain("is-success");
  });

  it("renders modal, tabs, and pagination semantics", () => {
    const markup = renderToStaticMarkup(
      <>
        <Dialog open title="Commands" onDismiss={() => undefined}>
          <Button>Run</Button>
        </Dialog>
        <Tabs
          label="Views"
          tabs={[{ id: "all", label: "All", panel: "All items" }]}
          active="all"
          onChange={() => undefined}
        />
        <Pagination
          page={1}
          pages={2}
          label="Pages"
          previousLabel="Previous"
          nextLabel="Next"
          onChange={() => undefined}
        />
      </>
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Pages"');
  });
});
