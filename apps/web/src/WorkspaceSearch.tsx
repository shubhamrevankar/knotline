/* eslint-disable knotline/no-hardcoded-user-visible-string -- Search copy will move into the shared catalog with the shell consolidation. */
import {
  ArrowRight,
  Bot,
  Boxes,
  FileSearch,
  History,
  Search,
  ShieldCheck,
  Workflow,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { useNavigate } from "react-router-dom";

import { searchWorkspace, type SearchResult } from "./api.js";
import {
  searchResultPath,
  searchResultSummary,
  searchResultTitle,
  searchResultTypeLabel
} from "./search-result.js";

const quickDestinations = [
  {
    label: "Workflows",
    detail: "Build and publish operations",
    to: "/app/workflows",
    icon: Workflow
  },
  { label: "Runs", detail: "Inspect live and completed execution", to: "/app/runs", icon: History },
  { label: "Agents", detail: "Find and manage AI teammates", to: "/app/agents", icon: Bot },
  { label: "Connections", detail: "Manage connected systems", to: "/app/connections", icon: Boxes }
] as const;

export function WorkspaceSearch({
  open,
  onClose
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      globalThis.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const normalized = query.trim();
    const requestId = ++requestRef.current;
    if (normalized.length < 2) return;
    const timer = globalThis.setTimeout(() => {
      void searchWorkspace(normalized)
        .then((data) => {
          if (requestRef.current !== requestId) return;
          setResults(data.slice(0, 8));
          setError("");
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setResults([]);
          setError("Search is temporarily unavailable. Try again.");
        })
        .finally(() => {
          if (requestRef.current === requestId) setBusy(false);
        });
    }, 180);
    return () => globalThis.clearTimeout(timer);
  }, [query]);

  const resultTypes = useMemo(
    () => [...new Set(results.map((result) => result.resourceType))],
    [results]
  );

  const closeSearch = () => {
    requestRef.current += 1;
    setQuery("");
    setResults([]);
    setError("");
    setBusy(false);
    setActiveIndex(0);
    onClose();
  };

  const openPath = (path: string) => {
    closeSearch();
    navigate(path);
  };
  const openResult = (result: SearchResult) => openPath(searchResultPath(result));
  const openAll = () => openPath(`/app/search?q=${encodeURIComponent(query.trim())}`);
  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!results.length) {
      if (event.key === "Enter" && query.trim().length >= 2) {
        event.preventDefault();
        openAll();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openResult(results[activeIndex] ?? results[0]!);
    }
  };

  return (
    <dialog
      aria-labelledby="workspace-search-title"
      className="workspace-search-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeSearch();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="workspace-search-frame">
        <header className="workspace-search-input-row">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="workspace-search-input">
            Search across workspace
          </label>
          <input
            autoComplete="off"
            id="workspace-search-input"
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setResults([]);
              setError("");
              setActiveIndex(0);
              setBusy(value.trim().length >= 2);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search workflows, runs, agents, people…"
            ref={inputRef}
            type="search"
            value={query}
          />
          {busy ? <span className="workspace-search-spinner" aria-label="Searching" /> : null}
          <button aria-label="Close search" onClick={closeSearch} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="workspace-search-body">
          <div className="workspace-search-context">
            <span id="workspace-search-title">
              {query.trim().length >= 2 ? "Best matches" : "Quick access"}
            </span>
            <small>
              <ShieldCheck aria-hidden="true" /> Only content you can access is shown
            </small>
          </div>

          {error ? (
            <p className="workspace-search-error" role="alert">
              {error}
            </p>
          ) : null}

          {query.trim().length < 2 ? (
            <div className="workspace-search-destinations">
              {quickDestinations.map(({ detail, icon: Icon, label, to }) => (
                <button key={to} onClick={() => openPath(to)} type="button">
                  <span>
                    <Icon aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : results.length ? (
            <>
              <div className="workspace-search-types" aria-label="Result types">
                {resultTypes.map((type) => (
                  <span key={type}>{searchResultTypeLabel(type)}</span>
                ))}
              </div>
              <div className="workspace-search-results" role="listbox" aria-label="Search results">
                {results.map((result, index) => (
                  <button
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? "is-active" : undefined}
                    key={result.id}
                    onClick={() => openResult(result)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span className="workspace-search-result-icon">
                      <FileSearch aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{searchResultTitle(result)}</strong>
                      <small>{searchResultSummary(result)}</small>
                    </span>
                    <span className="workspace-search-result-type">
                      {searchResultTypeLabel(result.resourceType)}
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                ))}
              </div>
              <button className="workspace-search-all" onClick={openAll} type="button">
                See all results for “{query.trim()}” <ArrowRight aria-hidden="true" />
              </button>
            </>
          ) : !busy && !error ? (
            <div className="workspace-search-empty">
              <Search aria-hidden="true" />
              <strong>No authorized matches</strong>
              <span>Try a workflow name, run ID, person, agent, or connected system.</span>
              <button onClick={openAll} type="button">
                Search all resources
              </button>
            </div>
          ) : null}
        </div>

        <footer className="workspace-search-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>Esc</kbd> Close
          </span>
        </footer>
      </div>
    </dialog>
  );
}
