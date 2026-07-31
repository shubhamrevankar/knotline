// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "./AppErrorBoundary.js";
import { RequestFailure } from "./query/errors.js";

function Crash(): never {
  throw new RequestFailure("fixture", "server", "request-test-123");
}

describe("application error boundary", () => {
  it("fails safely and exposes a correlation identifier", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Crash />
      </AppErrorBoundary>
    );
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    expect(screen.getByRole("alert").textContent).toContain("request-test-123");
    consoleError.mockRestore();
  });
});
