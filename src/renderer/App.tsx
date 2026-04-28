import { useEffect, useMemo, useState } from "react";
import type { LocalErrorPayload } from "../shared/types/ipc";
import type { LocalFileEntry, SortDirection, SortKey, TransferStatus } from "../shared/types/models";

type LocalHistoryState = {
  backStack: string[];
  forwardStack: string[];
};

const HOME_FALLBACK = "";
const AUTO_HIDE_DELAY_MS = 10_000;

type QueuePanelState = "hidden" | "expanded" | "collapsed" | "autoHidePending";
type MockTransferTask = {
  id: string;
  status: TransferStatus;
  direction: "upload" | "download";
  source: string;
  target: string;
};

const IS_DEV = import.meta.env.DEV;

export function App() {
  const [homePath, setHomePath] = useState<string>(HOME_FALLBACK);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [pathInput, setPathInput] = useState<string>("");
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [history, setHistory] = useState<LocalHistoryState>({ backStack: [], forwardStack: [] });
  const [queuePanelState, setQueuePanelState] = useState<QueuePanelState>("hidden");
  const [queuePinned, setQueuePinned] = useState<boolean>(false);
  const [mockTasks, setMockTasks] = useState<MockTransferTask[]>([]);

  async function navigateTo(targetPath: string, mode: "push" | "replace" | "back" | "forward" = "push"): Promise<void> {
    const previousPath = currentPath;
    try {
      const response = await window.cofinder.local.listDirectory({ path: targetPath });
      setErrorMessage("");
      setEntries(response.entries);
      setCurrentPath(response.path);
      setPathInput(response.path);
      setSelectedPath(null);
      setHomePath((prev) => (prev || response.path));

      setHistory((prev) => {
        if (mode === "replace") return prev;
        if (mode === "back") {
          if (prev.backStack.length === 0) return prev;
          const nextBack = prev.backStack.slice(0, -1);
          const nextForward = previousPath ? [previousPath, ...prev.forwardStack] : prev.forwardStack;
          return { backStack: nextBack, forwardStack: nextForward };
        }
        if (mode === "forward") {
          if (prev.forwardStack.length === 0) return prev;
          const nextBack = previousPath ? [...prev.backStack, previousPath] : prev.backStack;
          return { backStack: nextBack, forwardStack: prev.forwardStack.slice(1) };
        }
        if (!previousPath || response.path === previousPath) return prev;
        return { backStack: [...prev.backStack, previousPath], forwardStack: [] };
      });
    } catch (error) {
      const localError = parseLocalError(error);
      setErrorMessage(localError.message);
      setPathInput(previousPath);
    }
  }

  useEffect(() => {
    void navigateTo("", "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueStats = useMemo(() => {
    const activeCount = mockTasks.filter((task) => task.status === "running").length;
    const queuedCount = mockTasks.filter((task) => task.status === "pending").length;
    const failedCount = mockTasks.filter((task) => task.status === "failed").length;
    const completedCount = mockTasks.filter((task) => task.status === "success" || task.status === "canceled").length;
    const allDone = mockTasks.length > 0 && activeCount === 0 && queuedCount === 0;
    return { activeCount, queuedCount, failedCount, completedCount, allDone };
  }, [mockTasks]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (mockTasks.length === 0) {
      setQueuePanelState("hidden");
      return;
    }

    if (queueStats.allDone && queueStats.failedCount === 0 && !queuePinned) {
      setQueuePanelState("autoHidePending");
      timer = setTimeout(() => {
        setQueuePanelState("hidden");
        setMockTasks([]);
      }, AUTO_HIDE_DELAY_MS);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    setQueuePanelState((prev) => {
      if (prev === "hidden" || prev === "autoHidePending") return "expanded";
      return prev;
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [mockTasks, queuePinned, queueStats.allDone, queueStats.failedCount]);

  const sortedEntries = useMemo(() => {
    const copied = [...entries];
    copied.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;

      let value = 0;
      if (sortKey === "name") value = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (sortKey === "size") value = a.size - b.size;
      if (sortKey === "mtime") value = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      return sortDirection === "asc" ? value : -value;
    });
    return copied;
  }, [entries, sortDirection, sortKey]);

  const selectedEntries = selectedPath ? entries.filter((entry) => entry.fullPath === selectedPath) : [];
  const selectedSize = selectedEntries.reduce((acc, item) => acc + item.size, 0);
  const totalSize = entries.reduce((acc, item) => acc + item.size, 0);

  async function handleRowDoubleClick(entry: LocalFileEntry): Promise<void> {
    if (entry.type === "directory") {
      await navigateTo(entry.fullPath);
      return;
    }
    try {
      await window.cofinder.local.openPath({ path: entry.fullPath });
      setErrorMessage("");
    } catch (error) {
      const localError = parseLocalError(error);
      setErrorMessage(localError.message);
    }
  }

  function handleSort(nextKey: SortKey): void {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function getParentPath(input: string): string {
    if (!input || input === "/") return "/";
    const parts = input.split("/").filter(Boolean);
    if (parts.length === 0) return "/";
    return `/${parts.slice(0, -1).join("/")}` || "/";
  }

  function summarizeQueue(): string {
    if (queueStats.activeCount === 0 && queueStats.queuedCount === 0) {
      return queueStats.failedCount > 0 ? `${queueStats.failedCount} failed task(s)` : "No active transfers";
    }
    return `${queueStats.activeCount} active, ${queueStats.queuedCount} queued`;
  }

  function seedMockTransfer(status: TransferStatus): void {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setMockTasks((prev) => [
      ...prev,
      {
        id,
        status,
        direction: status === "pending" ? "upload" : "download",
        source: "/Users/demo/source.txt",
        target: "/tmp/target.txt"
      }
    ]);
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="title-group">
          <strong>CoFinder</strong>
        </div>
      </header>
      <main className="pane-layout">
        <section className="pane local-pane">
          <div className="pane-toolbar">
            <button
              type="button"
              className="nav-btn"
              aria-label="Back"
              title="Back"
              disabled={history.backStack.length === 0}
              onClick={() => {
                const target = history.backStack[history.backStack.length - 1];
                if (target) void navigateTo(target, "back");
              }}
            >
              ←
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Forward"
              title="Forward"
              disabled={history.forwardStack.length === 0}
              onClick={() => {
                const target = history.forwardStack[0];
                if (target) void navigateTo(target, "forward");
              }}
            >
              →
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Up"
              title="Up"
              onClick={() => void navigateTo(getParentPath(currentPath))}
            >
              ↑
            </button>
            <button type="button" className="nav-btn" aria-label="Home" title="Home" onClick={() => void navigateTo(homePath)}>
              ⌂
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Refresh"
              title="Refresh"
              disabled={!currentPath}
              onClick={() => void navigateTo(currentPath, "replace")}
            >
              ↻
            </button>
          </div>

          <form
            className="path-form"
            onSubmit={(event) => {
              event.preventDefault();
              void navigateTo(pathInput);
            }}
          >
            <input value={pathInput} onChange={(event) => setPathInput(event.target.value)} aria-label="Local path" />
          </form>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="table-wrap">
            <table className="file-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-size" />
                <col className="col-mtime" />
                <col className="col-type" />
              </colgroup>
              <thead>
                <tr>
                  <th className="name-header" onClick={() => handleSort("name")}>
                    name {sortKey === "name" ? sortMark(sortDirection) : ""}
                  </th>
                  <th className="size-header" onClick={() => handleSort("size")}>
                    size {sortKey === "size" ? sortMark(sortDirection) : ""}
                  </th>
                  <th className="mtime-header" onClick={() => handleSort("mtime")}>
                    mtime {sortKey === "mtime" ? sortMark(sortDirection) : ""}
                  </th>
                  <th className="type-header">type</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => (
                  <tr
                    key={entry.fullPath}
                    className={selectedPath === entry.fullPath ? "row-selected" : ""}
                    onClick={() => setSelectedPath(entry.fullPath)}
                    onDoubleClick={() => void handleRowDoubleClick(entry)}
                  >
                    <td className="name-cell" title={entry.name}>
                      <span className={`file-kind kind-${entry.type}`} aria-hidden="true">
                        {entry.type === "directory" ? "▸" : "·"}
                      </span>
                      <span className="name-text">{entry.name}</span>
                    </td>
                    <td className="size-cell">{entry.type === "directory" ? "—" : formatSize(entry.size)}</td>
                    <td className="mtime-cell">{formatTime(entry.mtime)}</td>
                    <td className="type-cell">{entry.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pane-status">
            <span>Selected: {selectedEntries.length}</span>
            <span>Total: {entries.length}</span>
            <span>Selected Size: {formatSize(selectedSize)}</span>
            <span>Total Size: {formatSize(totalSize)}</span>
          </div>
        </section>
        <section className="splitter" />
        <section className="pane placeholder-pane">
          <div className="placeholder-title">Not connected</div>
          <div className="placeholder-body">Choose or create a server connection to browse remote files.</div>
          <button type="button" className="toolbar-button placeholder-action" disabled title="Will be available in M2">
            Connect...
          </button>
        </section>
      </main>

      {queuePanelState !== "hidden" ? (
        <section className="queue-area">
          {queuePanelState === "collapsed" ? (
            <button
              type="button"
              className="queue-collapsed-bar"
              onClick={() => setQueuePanelState("expanded")}
              title="Expand transfer queue"
            >
              <span>Transfer Queue</span>
              <span>{summarizeQueue()}</span>
            </button>
          ) : (
            <div className="queue-panel">
              <div className="queue-header">
                <div>
                  <strong>Transfer Queue</strong>
                  <span className="queue-summary">{summarizeQueue()}</span>
                </div>
                <div className="queue-controls">
                  <button type="button" className="toolbar-button" onClick={() => setQueuePanelState("collapsed")}>
                    Minimize
                  </button>
                  <button
                    type="button"
                    className={`toolbar-button ${queuePinned ? "is-active" : ""}`}
                    onClick={() => setQueuePinned((prev) => !prev)}
                  >
                    {queuePinned ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => {
                      setMockTasks([]);
                      setQueuePanelState("hidden");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="queue-list">
                {mockTasks.length === 0 ? (
                  <div className="queue-empty">No transfer tasks.</div>
                ) : (
                  mockTasks.map((task) => (
                    <div key={task.id} className="queue-item">
                      <span>{task.direction}</span>
                      <span className={`queue-status status-${task.status}`}>{task.status}</span>
                      <span className="queue-path" title={`${task.source} -> ${task.target}`}>
                        {task.source} {"->"} {task.target}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {queuePanelState === "autoHidePending" ? (
                <div className="queue-footnote">All tasks completed. Auto-hiding in 10 seconds.</div>
              ) : null}
              {IS_DEV ? (
                <details className="queue-debug">
                  <summary>Debug transfer seeds</summary>
                  <div className="queue-debug-actions">
                    <button type="button" className="toolbar-button" onClick={() => seedMockTransfer("running")}>
                      +Running
                    </button>
                    <button type="button" className="toolbar-button" onClick={() => seedMockTransfer("pending")}>
                      +Queued
                    </button>
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => setMockTasks((prev) => prev.map((task) => ({ ...task, status: "success" })))}
                      disabled={mockTasks.length === 0}
                    >
                      Complete all
                    </button>
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() =>
                        setMockTasks((prev) =>
                          prev.length === 0 ? prev : [{ ...prev[0], status: "failed" }, ...prev.slice(1)]
                        )
                      }
                      disabled={mockTasks.length === 0}
                    >
                      Mark failed
                    </button>
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function parseLocalError(error: unknown): LocalErrorPayload {
  const rawMessage = error instanceof Error ? error.message : "Unknown local operation error";
  try {
    return JSON.parse(rawMessage) as LocalErrorPayload;
  } catch {
    const start = rawMessage.indexOf("{");
    const end = rawMessage.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(rawMessage.slice(start, end + 1)) as LocalErrorPayload;
      } catch {
        // no-op: fallback below
      }
    }
    return {
      code: "UNKNOWN",
      message: rawMessage
    };
  }
}

function sortMark(direction: SortDirection): string {
  return direction === "asc" ? "^" : "v";
}
