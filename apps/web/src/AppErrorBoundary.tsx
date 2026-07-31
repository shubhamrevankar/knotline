import { Button, ErrorState } from "@knotline/ui";
import { Component, type ReactNode } from "react";

import { msg } from "./i18n.js";
import { RequestFailure } from "./query/errors.js";

interface BoundaryState {
  readonly error: unknown;
  readonly requestId: string;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null, requestId: "" };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    const requestId =
      error instanceof RequestFailure && error.requestId
        ? error.requestId
        : `local-${crypto.randomUUID()}`;
    return { error, requestId };
  }

  override componentDidCatch(): void {
    // Production telemetry is introduced with the observability milestone; user content is never sent here.
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="customer-system-state">
        <ErrorState title={msg("boundary.heading")}>
          <p>{msg("boundary.body")}</p>
          <p>{msg("boundary.request", { requestId: this.state.requestId })}</p>
          <Button onClick={() => globalThis.location.reload()}>{msg("boundary.reload")}</Button>
        </ErrorState>
      </div>
    );
  }
}
