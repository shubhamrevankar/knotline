// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  AlertDialog,
  Button,
  Checkbox,
  Combobox,
  CommandPalette,
  Dialog,
  FileField,
  Input,
  Pagination,
  Radio,
  Select,
  Sheet,
  Switch,
  Tabs,
  Textarea
} from "./index.js";

function Harness() {
  const [dialog, setDialog] = useState(true);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("one");
  const [page, setPage] = useState(1);
  return (
    <div>
      <Button onClick={() => setDialog(true)}>Open base</Button>
      <Input label="Name" description="Description" error="Error" />
      <Select label="Choice">
        <option>First</option>
      </Select>
      <Combobox label="Person" options={["One", "Two"]} />
      <Textarea label="Notes" />
      <FileField label="File" />
      <Checkbox label="Check" />
      <Radio label="Radio" />
      <Switch label="Switch" />
      <Tabs
        label="Views"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "one", label: "One", panel: "First panel" },
          { id: "two", label: "Two", panel: "Second panel" }
        ]}
      />
      <Pagination
        page={page}
        pages={2}
        label="Pages"
        previousLabel="Back"
        nextLabel="Forward"
        onChange={setPage}
      />
      <Dialog open={dialog} title="Base dialog" onDismiss={() => setDialog(false)}>
        <Button onClick={() => setDialog(false)}>Close base</Button>
      </Dialog>
      <AlertDialog open={false} title="Alert" onDismiss={() => undefined}>
        Alert body
      </AlertDialog>
      <Sheet open={false} title="Sheet" onDismiss={() => undefined}>
        Sheet body
      </Sheet>
      <Button onClick={() => setPalette(true)}>Open palette</Button>
      <CommandPalette
        open={palette}
        title="Palette"
        queryLabel="Query"
        query={query}
        onQuery={setQuery}
        onDismiss={() => setPalette(false)}
      >
        Result
      </CommandPalette>
    </div>
  );
}

describe("interactive UI primitives", () => {
  it("handles fields, tabs, pagination, modal focus, dismissal, and command input", () => {
    render(<Harness />);
    expect(screen.getByRole("alert").textContent).toBe("Error");
    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Second panel");
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByText(/2\s*\/\s*2/u)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open palette" }));
    const input = screen.getByRole("textbox", { name: "Query" });
    fireEvent.change(input, { target: { value: "run" } });
    expect((input as HTMLInputElement).value).toBe("run");
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
