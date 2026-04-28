import { useEffect, useMemo, useState } from "react";
import type {
  LocalErrorPayload,
  RemoteConnectRequest
} from "../shared/types/ipc";
import type { LocalFileEntry, RemoteFileEntry, SortDirection, SortKey, TransferStatus } from "../shared/types/models";

type LocalHistoryState = {
  backStack: string[];
  forwardStack: string[];
};

type RemoteConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
type RemoteHistoryState = {
  backStack: string[];
  forwardStack: string[];
};
type ConnectFormState = {
  alias: string;
  host: string;
  port: string;
  username: string;
  password: string;
  initialPath: string;
  saveProfile: boolean;
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
  const [remoteConnectionStatus, setRemoteConnectionStatus] = useState<RemoteConnectionStatus>("disconnected");
  const [showConnectForm, setShowConnectForm] = useState<boolean>(false);
  const [remoteConnectionId, setRemoteConnectionId] = useState<string | null>(null);
  const [remoteHomePath, setRemoteHomePath] = useState<string>("/");
  const [remoteCurrentPath, setRemoteCurrentPath] = useState<string>("/");
  const [remotePathInput, setRemotePathInput] = useState<string>("/");
  const [remoteEntries, setRemoteEntries] = useState<RemoteFileEntry[]>([]);
  const [remoteSelectedPath, setRemoteSelectedPath] = useState<string | null>(null);
  const [remoteSortKey, setRemoteSortKey] = useState<SortKey>("name");
  const [remoteSortDirection, setRemoteSortDirection] = useState<SortDirection>("asc");
  const [remoteHistory, setRemoteHistory] = useState<RemoteHistoryState>({ backStack: [], forwardStack: [] });
  const [remoteError, setRemoteError] = useState<string>("");
  const [connectForm, setConnectForm] = useState<ConnectFormState>({
    alias: "",
    host: "",
    port: "22",
    username: "",
    password: "",
    initialPath: "",
    saveProfile: false
  });
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

  const sortedRemoteEntries = useMemo(() => {
    const copied = [...remoteEntries];
    copied.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      let value = 0;
      if (remoteSortKey === "name") value = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (remoteSortKey === "size") value = a.size - b.size;
      if (remoteSortKey === "mtime") value = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      return remoteSortDirection === "asc" ? value : -value;
    });
    return copied;
  }, [remoteEntries, remoteSortDirection, remoteSortKey]);

  const selectedEntries = selectedPath ? entries.filter((entry) => entry.fullPath === selectedPath) : [];
  const selectedSize = selectedEntries.reduce((acc, item) => acc + item.size, 0);
  const totalSize = entries.reduce((acc, item) => acc + item.size, 0);
  const remoteSelectedEntries = remoteSelectedPath
    ? remoteEntries.filter((entry) => entry.fullPath === remoteSelectedPath)
    : [];
  const remoteSelectedSize = remoteSelectedEntries.reduce((acc, item) => acc + item.size, 0);
  const remoteTotalSize = remoteEntries.reduce((acc, item) => acc + item.size, 0);

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

  function handleRemoteSort(nextKey: SortKey): void {
    if (remoteSortKey === nextKey) {
      setRemoteSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setRemoteSortKey(nextKey);
    setRemoteSortDirection("asc");
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

  async function connectRemote(): Promise<void> {
    const host = connectForm.host.trim();
    const username = connectForm.username.trim();
    const password = connectForm.password;
    const port = Number(connectForm.port);

    if (!host) {
      setRemoteError("Host is required.");
      return;
    }
    if (!username) {
      setRemoteError("Username is required.");
      return;
    }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      setRemoteError("Port must be between 1 and 65535.");
      return;
    }
    if (!password.trim()) {
      setRemoteError("Password is required.");
      return;
    }

    const payload: RemoteConnectRequest = {
      alias: connectForm.alias.trim() || undefined,
      host,
      port,
      username,
      password,
      defaultRemotePath: connectForm.initialPath.trim() || undefined,
      saveProfile: connectForm.saveProfile
    };

    setRemoteConnectionStatus("connecting");
    setRemoteError("");

    const connectResult = await window.cofinder.remote.connect(payload);
    if (!connectResult.ok) {
      setRemoteConnectionStatus("failed");
      setRemoteError(connectResult.error.message);
      return;
    }

    const { connectionId, homePath } = connectResult.data;
    setRemoteConnectionId(connectionId);
    setRemoteHomePath(homePath || "/");
    setRemoteConnectionStatus("connected");
    setShowConnectForm(false);
    const initialPath = connectForm.initialPath.trim() || homePath || "/";
    const listed = await listRemotePath(connectionId, initialPath, "replace");
    if (!listed) {
      setRemoteError(`Connected, but failed to list initial path: ${initialPath}. You can retry with another path.`);
      setRemoteCurrentPath(homePath || "/");
      setRemotePathInput(initialPath);
    }
  }

  async function listRemotePath(
    connectionId: string,
    targetPath: string,
    mode: "push" | "replace" | "back" | "forward" = "push"
  ): Promise<boolean> {
    const previousPath = remoteCurrentPath;
    const result = await window.cofinder.remote.listDirectory({
      connectionId,
      path: targetPath
    });
    if (!result.ok) {
      setRemoteError(result.error.message);
      setRemotePathInput(previousPath || targetPath);
      return false;
    }

    const payload = result.data;
    setRemoteError("");
    setRemoteEntries(payload.entries);
    setRemoteCurrentPath(payload.path);
    setRemotePathInput(payload.path);
    setRemoteSelectedPath(null);

    setRemoteHistory((prev) => {
      if (mode === "replace") return prev;
      if (mode === "back") {
        return {
          backStack: prev.backStack.slice(0, -1),
          forwardStack: previousPath ? [previousPath, ...prev.forwardStack] : prev.forwardStack
        };
      }
      if (mode === "forward") {
        return {
          backStack: previousPath ? [...prev.backStack, previousPath] : prev.backStack,
          forwardStack: prev.forwardStack.slice(1)
        };
      }
      if (!previousPath || previousPath === payload.path) return prev;
      return {
        backStack: [...prev.backStack, previousPath],
        forwardStack: []
      };
    });
    return true;
  }

  async function handleRemoteDoubleClick(entry: RemoteFileEntry): Promise<void> {
    if (entry.type === "directory") {
      if (remoteConnectionId) await listRemotePath(remoteConnectionId, entry.fullPath);
      return;
    }
    setRemoteError("Remote file open/edit will be implemented later.");
  }

  async function disconnectRemote(): Promise<void> {
    if (!remoteConnectionId) return;
    await window.cofinder.remote.disconnect({ connectionId: remoteConnectionId });
    setRemoteConnectionId(null);
    setRemoteConnectionStatus("disconnected");
    setRemoteCurrentPath("/");
    setRemotePathInput("/");
    setRemoteEntries([]);
    setRemoteSelectedPath(null);
    setRemoteError("");
    setRemoteHistory({ backStack: [], forwardStack: [] });
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
        <section className="pane remote-pane">
          {remoteConnectionStatus === "disconnected" && !showConnectForm ? (
            <div className="placeholder-pane">
              <div className="placeholder-title">Not connected</div>
              <div className="placeholder-body">Connect to a server to browse remote files.</div>
              <button type="button" className="toolbar-button placeholder-action" onClick={() => setShowConnectForm(true)}>
                Connect...
              </button>
            </div>
          ) : null}

          {showConnectForm ? (
            <form
              className="connect-form"
              onSubmit={(event) => {
                event.preventDefault();
                void connectRemote();
              }}
            >
              <div className="connect-grid">
                <label>
                  Alias
                  <input
                    value={connectForm.alias}
                    onChange={(event) => setConnectForm((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                </label>
                <label>
                  Host *
                  <input
                    required
                    value={connectForm.host}
                    onChange={(event) => setConnectForm((prev) => ({ ...prev, host: event.target.value }))}
                  />
                </label>
                <label>
                  Port *
                  <input
                    required
                    value={connectForm.port}
                    onChange={(event) => setConnectForm((prev) => ({ ...prev, port: event.target.value }))}
                  />
                </label>
                <label>
                  Username *
                  <input
                    required
                    value={connectForm.username}
                    onChange={(event) => setConnectForm((prev) => ({ ...prev, username: event.target.value }))}
                  />
                </label>
                <label>
                  Password *
                  <input
                    required
                    type="password"
                    value={connectForm.password}
                    onChange={(event) => setConnectForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </label>
                <label>
                  Initial path
                  <input
                    value={connectForm.initialPath}
                    onChange={(event) => setConnectForm((prev) => ({ ...prev, initialPath: event.target.value }))}
                  />
                </label>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={connectForm.saveProfile}
                  onChange={(event) => setConnectForm((prev) => ({ ...prev, saveProfile: event.target.checked }))}
                />
                Save profile (without password)
              </label>
              {remoteError ? <div className="error-banner">{remoteError}</div> : null}
              <div className="connect-actions">
                <button type="submit" className="toolbar-button">
                  {remoteConnectionStatus === "connecting" ? "Connecting..." : "Connect"}
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => {
                    if (remoteConnectionStatus !== "connecting") {
                      setShowConnectForm(false);
                      setRemoteError("");
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {remoteConnectionStatus === "connected" && remoteConnectionId ? (
            <>
              <div className="pane-toolbar">
                <button
                  type="button"
                  className="nav-btn"
                  title="Back"
                  disabled={remoteHistory.backStack.length === 0}
                  onClick={() => {
                    const target = remoteHistory.backStack[remoteHistory.backStack.length - 1];
                    if (target) void listRemotePath(remoteConnectionId, target, "back");
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Forward"
                  disabled={remoteHistory.forwardStack.length === 0}
                  onClick={() => {
                    const target = remoteHistory.forwardStack[0];
                    if (target) void listRemotePath(remoteConnectionId, target, "forward");
                  }}
                >
                  →
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Up"
                  onClick={() => void listRemotePath(remoteConnectionId, getParentPath(remoteCurrentPath))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Home"
                  onClick={() => void listRemotePath(remoteConnectionId, remoteHomePath)}
                >
                  ⌂
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Refresh"
                  onClick={() => void listRemotePath(remoteConnectionId, remoteCurrentPath, "replace")}
                >
                  ↻
                </button>
                <button type="button" className="toolbar-button" onClick={() => void disconnectRemote()}>
                  Disconnect
                </button>
              </div>

              <form
                className="path-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void listRemotePath(remoteConnectionId, remotePathInput);
                }}
              >
                <input
                  value={remotePathInput}
                  onChange={(event) => setRemotePathInput(event.target.value)}
                  aria-label="Remote path"
                />
              </form>

              {remoteError ? <div className="error-banner">{remoteError}</div> : null}

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
                      <th className="name-header" onClick={() => handleRemoteSort("name")}>
                        name {remoteSortKey === "name" ? sortMark(remoteSortDirection) : ""}
                      </th>
                      <th className="size-header" onClick={() => handleRemoteSort("size")}>
                        size {remoteSortKey === "size" ? sortMark(remoteSortDirection) : ""}
                      </th>
                      <th className="mtime-header" onClick={() => handleRemoteSort("mtime")}>
                        mtime {remoteSortKey === "mtime" ? sortMark(remoteSortDirection) : ""}
                      </th>
                      <th className="type-header">type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRemoteEntries.map((entry) => (
                      <tr
                        key={entry.fullPath}
                        className={remoteSelectedPath === entry.fullPath ? "row-selected" : ""}
                        onClick={() => setRemoteSelectedPath(entry.fullPath)}
                        onDoubleClick={() => void handleRemoteDoubleClick(entry)}
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
                <span>Selected: {remoteSelectedEntries.length}</span>
                <span>Total: {remoteEntries.length}</span>
                <span>Selected Size: {formatSize(remoteSelectedSize)}</span>
                <span>Total Size: {formatSize(remoteTotalSize)}</span>
              </div>
            </>
          ) : null}
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
