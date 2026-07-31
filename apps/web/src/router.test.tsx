import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppRouter } from "./router.js";
import { WEB_ROUTE_MANIFEST } from "./routes/manifest.js";

describe("canonical web router", () => {
  it("registers all canonical routes in the correct layout plane", () => {
    expect(WEB_ROUTE_MANIFEST).toHaveLength(105);
    expect(new Set(WEB_ROUTE_MANIFEST.map(({ id }) => id)).size).toBe(105);
    expect(
      WEB_ROUTE_MANIFEST.filter(({ path }) => path.startsWith("/ops")).every(
        ({ plane }) => plane === "operator"
      )
    ).toBe(true);
  });

  it("renders public home, known solution, and intentional unknown state", () => {
    const render = (path: string) =>
      renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      );
    expect(render("/")).toContain("Operational work, made legible");
    expect(render("/solutions/operations")).toContain("Operations operations");
    expect(render("/solutions/not-real")).toContain("Page not found");
  });

  it("keeps operator and customer shells isolated", () => {
    const render = (path: string) =>
      renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      );
    expect(render("/ops")).toContain("operator plane");
    expect(render("/app/runs")).toContain("Checking secure session");
    expect(render("/app/runs")).not.toContain("operator plane");
  });

  it("renders the complete component workbench and authenticated system states", () => {
    const render = (path: string) =>
      renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      );
    const workbench = render("/docs/components");
    expect(workbench).toContain("Loading component workbench");

    for (const [state, heading] of [
      ["unauthenticated", "Authentication required"],
      ["forbidden", "Access not permitted"],
      ["plan", "Plan upgrade required"],
      ["suspended", "Workspace suspended"],
      ["archived", "Workspace archived"],
      ["deleted", "Workspace deleted"],
      ["offline", "You are offline"],
      ["degraded", "Service dependency degraded"]
    ]) {
      expect(render(`/app/workflows?state=${state}`)).toContain(heading);
    }
  });

  it("renders planned, dynamic, deep-link, and not-found branches truthfully", () => {
    const render = (path: string) =>
      renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      );
    expect(render("/pricing")).toContain("planned");
    expect(render("/templates/incident-response")).toContain("Available preview");
    expect(render("/templates/not-real")).toContain("Page not found");
    expect(render("/help/topic")).toContain("Planned product surface");
    expect(render("/app/runs?state=unknown")).toContain("Checking secure session");
    expect(render("/app/not-real")).toContain("Page not found");
    expect(render("/not-real")).toContain("Return to a known page");
  });
});
