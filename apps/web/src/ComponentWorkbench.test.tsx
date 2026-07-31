// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ComponentWorkbench } from "./ComponentWorkbench.js";

describe("component workbench interactions", () => {
  it("exercises controls, overlays, focus restoration, and navigation primitives", () => {
    render(<ComponentWorkbench />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Knotline interface workbench"
    );
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Version history panel");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("2 / 3")).toBeTruthy();

    const dialogTrigger = screen.getByRole("button", { name: "Open dialog" });
    dialogTrigger.focus();
    fireEvent.click(dialogTrigger);
    expect(screen.getByRole("dialog", { name: "Accessible dialog" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(dialogTrigger);

    fireEvent.click(screen.getByRole("button", { name: "Open alert dialog" }));
    expect(screen.getByRole("dialog", { name: "Confirm consequential action" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.getByRole("dialog", { name: "Responsive sheet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
    const query = screen.getByRole("textbox", { name: "Find an action" });
    fireEvent.change(query, { target: { value: "create" } });
    expect((query as HTMLInputElement).value).toBe("create");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
