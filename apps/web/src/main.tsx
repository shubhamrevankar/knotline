import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "@xyflow/react/dist/style.css";
import "@knotline/ui/styles.css";
import "./styles.css";
import { AppRouter } from "./router.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import { mayRetry } from "./query/errors.js";
import { applyInterfacePreferences, readInterfacePreferences } from "./profilePreferences.js";

applyInterfacePreferences(readInterfacePreferences());

if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (failureCount, error) => mayRetry(error, failureCount), staleTime: 30_000 }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppErrorBoundary>
          <AppRouter />
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
