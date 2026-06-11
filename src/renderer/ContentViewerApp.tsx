import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  applyContentOpenRequest,
  highlightTextLine,
  requestFromSearchResult,
  type ContentViewerTab
} from "./contentViewerModel";
import type { ContentViewerOpenRequest, TextSearchResponse } from "../shared/types/ipc";

type TextLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  content: string;
  startLine: number;
  targetLine?: number;
  truncatedBefore: boolean;
  truncatedAfter: boolean;
  error: string;
};

type SearchState = {
  status: "idle" | "loading" | "ready" | "error";
  query: string;
  matches: TextSearchResponse["matches"];
  truncated: boolean;
  tool: TextSearchResponse["tool"] | null;
  error: string;
};

export function ContentViewerApp() {
  const [tabs, setTabs] = useState<ContentViewerTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    return window.cofinder.content.onOpenRequest((request) => {
      setTabs((prev) => {
        const next = applyContentOpenRequest(prev, activeTabId, request);
        setActiveTabId(next.activeTabId);
        return next.tabs;
      });
    });
  }, [activeTabId]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  function openRequest(request: ContentViewerOpenRequest): void {
    setTabs((prev) => {
      const next = applyContentOpenRequest(prev, activeTabId, request);
      setActiveTabId(next.activeTabId);
      return next.tabs;
    });
  }

  function closeTab(tabId: string): void {
    setTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === tabId);
      const next = prev.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) setActiveTabId(next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? null);
      return next;
    });
  }

  return (
    <div className="content-viewer-root">
      <div className="content-tabbar" role="tablist" aria-label="Open content tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`content-tab ${tab.id === activeTab?.id ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span>{tab.kind === "search" ? "Search: " : ""}{tab.title}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.title}`}
              className="content-tab-close"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeTab(tab.id);
                }
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      {activeTab ? (
        activeTab.kind === "text" ? (
          <ContentTextTab key={`${activeTab.id}:${activeTab.initialLine ?? 0}:${activeTab.highlightQuery ?? ""}`} tab={activeTab} onClose={() => closeTab(activeTab.id)} />
        ) : (
          <ContentSearchTab tab={activeTab} onOpenRequest={openRequest} onClose={() => closeTab(activeTab.id)} />
        )
      ) : (
        <div className="content-empty">Open View Text or Search Contents from CoFinder.</div>
      )}
    </div>
  );
}

function ContentTextTab(props: { tab: ContentViewerTab; onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [findQuery, setFindQuery] = useState(props.tab.highlightQuery ?? "");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [state, setState] = useState<TextLoadState>({
    status: "idle",
    content: "",
    startLine: 1,
    targetLine: props.tab.initialLine,
    truncatedBefore: false,
    truncatedAfter: false,
    error: ""
  });

  useEffect(() => {
    let canceled = false;
    async function load() {
      setState((prev) => ({ ...prev, status: "loading", error: "" }));
      const result = props.tab.initialLine
        ? await readLineWindow(props.tab, props.tab.initialLine)
        : await readInitialText(props.tab);
      if (canceled) return;
      if (!result.ok) {
        setState((prev) => ({ ...prev, status: "error", error: result.error.message }));
        return;
      }
      setState({
        status: "ready",
        content: result.data.content,
        startLine: "startLine" in result.data ? result.data.startLine : 1,
        targetLine: "targetLine" in result.data ? result.data.targetLine : props.tab.initialLine,
        truncatedBefore: "truncatedBefore" in result.data ? result.data.truncatedBefore : false,
        truncatedAfter: "truncatedAfter" in result.data ? result.data.truncatedAfter : result.data.truncated,
        error: ""
      });
      requestAnimationFrame(() => {
        const target = scrollerRef.current?.querySelector("[data-target-line='true']");
        target?.scrollIntoView({ block: "center" });
      });
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [props.tab]);

  const lines = useMemo(() => state.content.split(/\r?\n/), [state.content]);
  const activeQuery = findQuery.trim();
  const matchLineIndexes = useMemo(
    () => activeQuery ? lines.map((line, index) => line.toLowerCase().includes(activeQuery.toLowerCase()) ? index : -1).filter((index) => index >= 0) : [],
    [activeQuery, lines]
  );

  function scrollPage(direction: 1 | -1): void {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ top: direction * Math.max(120, scroller.clientHeight * 0.85), behavior: "smooth" });
  }

  function jumpMatch(direction: 1 | -1): void {
    if (matchLineIndexes.length === 0) return;
    const next = (activeMatchIndex + direction + matchLineIndexes.length) % matchLineIndexes.length;
    setActiveMatchIndex(next);
    scrollerRef.current?.querySelector(`[data-line-index='${matchLineIndexes[next]}']`)?.scrollIntoView({ block: "center" });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT") return;
    if (event.key === "q") props.onClose();
    if (event.key === "l") setLineNumbers((prev) => !prev);
    if (event.key === "/") {
      event.preventDefault();
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }
    if (event.key === "n") jumpMatch(event.shiftKey ? -1 : 1);
    if (event.key === " ") {
      event.preventDefault();
      scrollPage(1);
    }
    if (event.key === "b") scrollPage(-1);
    if (event.key === "g") scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (event.key === "G") scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
    if (event.key === "j") scrollerRef.current?.scrollBy({ top: 18 });
    if (event.key === "k") scrollerRef.current?.scrollBy({ top: -18 });
  }

  return (
    <div className="content-pane" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="content-toolbar">
        <button type="button" onClick={() => setLineNumbers((prev) => !prev)}>{lineNumbers ? "Hide Lines" : "Line Numbers"}</button>
        <button type="button" onClick={() => findInputRef.current?.focus()}>Find</button>
        <input ref={findInputRef} value={findQuery} placeholder="Find in file" onChange={(event) => { setFindQuery(event.target.value); setActiveMatchIndex(0); }} />
        <button type="button" disabled={matchLineIndexes.length === 0} onClick={() => jumpMatch(-1)}>Prev Match</button>
        <button type="button" disabled={matchLineIndexes.length === 0} onClick={() => jumpMatch(1)}>Next Match</button>
        <button type="button" onClick={() => scrollPage(-1)}>Prev Page</button>
        <button type="button" onClick={() => scrollPage(1)}>Next Page</button>
        <button type="button" onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>Top</button>
        <button type="button" onClick={() => scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" })}>Bottom</button>
        <span className="content-status">{state.status === "loading" ? "Loading..." : `${matchLineIndexes.length} matches`}</span>
      </div>
      {state.error ? <div className="content-error">{state.error}</div> : null}
      <div ref={scrollerRef} className="content-text-scroller">
        {state.truncatedBefore ? <div className="content-truncated">Earlier lines not loaded.</div> : null}
        {lines.map((line, index) => {
          const lineNumber = state.startLine + index;
          const parts = highlightTextLine(line, activeQuery);
          return (
            <div key={`${lineNumber}-${index}`} className="content-line" data-line-index={index} data-target-line={state.targetLine === lineNumber ? "true" : undefined}>
              {lineNumbers ? <span className="content-line-number">{lineNumber}</span> : null}
              <span className="content-line-text">
                {parts.map((part, partIndex) => part.match ? <mark key={partIndex}>{part.text}</mark> : <span key={partIndex}>{part.text}</span>)}
              </span>
            </div>
          );
        })}
        {state.truncatedAfter ? <div className="content-truncated">More lines not loaded.</div> : null}
      </div>
    </div>
  );
}

function ContentSearchTab(props: { tab: ContentViewerTab; onOpenRequest: (request: ContentViewerOpenRequest) => void; onClose: () => void }) {
  const [state, setState] = useState<SearchState>({
    status: "idle",
    query: props.tab.query ?? "",
    matches: [],
    truncated: false,
    tool: null,
    error: ""
  });

  async function submitSearch(): Promise<void> {
    const query = state.query.trim();
    if (!query) {
      setState((prev) => ({ ...prev, status: "error", error: "Search query is required." }));
      return;
    }
    setState((prev) => ({ ...prev, status: "loading", error: "" }));
    const result = props.tab.pane === "local"
      ? await window.cofinder.local.searchText({ path: props.tab.path, query, maxMatches: 300 })
      : await window.cofinder.remote.searchText({ connectionId: props.tab.connectionId ?? "", path: props.tab.path, query, maxMatches: 300 });
    if (!result.ok) {
      setState((prev) => ({ ...prev, status: "error", error: result.error.message, matches: [] }));
      return;
    }
    setState({ status: "ready", query, matches: result.data.matches, truncated: result.data.truncated, tool: result.data.tool, error: "" });
  }

  return (
    <div className="content-pane" tabIndex={0} onKeyDown={(event) => { if (event.key === "q") props.onClose(); }}>
      <div className="content-toolbar">
        <input autoFocus value={state.query} placeholder="Search contents" onChange={(event) => setState((prev) => ({ ...prev, query: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void submitSearch(); }} />
        <button type="button" onClick={() => void submitSearch()} disabled={state.status === "loading"}>{state.status === "loading" ? "Searching..." : "Search"}</button>
        <span className="content-status">
          {state.status === "ready" ? `${state.matches.length}${state.truncated ? "+" : ""} matches${state.tool ? ` via ${state.tool}` : ""}` : props.tab.path}
        </span>
      </div>
      {state.error ? <div className="content-error">{state.error}</div> : null}
      <div className="content-search-results">
        {state.matches.map((match, index) => (
          <div key={`${match.path}:${match.line}:${index}`} className="content-search-row">
            <button
              type="button"
              onClick={() =>
                props.onOpenRequest(requestFromSearchResult({
                  pane: props.tab.pane,
                  path: match.path,
                  connectionId: props.tab.connectionId,
                  line: match.line,
                  query: state.query
                }))
              }
            >
              View
            </button>
            <div>
              <div className="content-search-path">{match.path}:{match.line}</div>
              <pre>{match.preview}</pre>
            </div>
          </div>
        ))}
        {state.status === "ready" && state.matches.length === 0 ? <div className="content-empty">No matches.</div> : null}
      </div>
    </div>
  );
}

async function readInitialText(tab: ContentViewerTab) {
  return tab.pane === "local"
    ? await window.cofinder.local.readText({ path: tab.path })
    : await window.cofinder.remote.readText({ connectionId: tab.connectionId ?? "", path: tab.path });
}

async function readLineWindow(tab: ContentViewerTab, targetLine: number) {
  const options = { targetLine, contextBefore: 80, contextAfter: 160 };
  return tab.pane === "local"
    ? await window.cofinder.local.readTextWindow({ path: tab.path, ...options })
    : await window.cofinder.remote.readTextWindow({ connectionId: tab.connectionId ?? "", path: tab.path, ...options });
}
