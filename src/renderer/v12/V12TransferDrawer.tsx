import { useState, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import type { TransferTask } from "../../shared/types/models";
import { formatTransferTaskMetaLine } from "./v12TransferRowSummary";
import { V12TbIcon } from "./shared/V12Icons";

const JOBS_PANE_HEIGHT_KEY = "cofinder.v12JobsPaneHeight";
const DEFAULT_JOBS_PANE_HEIGHT = 180;
const MIN_JOBS_PANE_HEIGHT = 96;
const MAX_JOBS_PANE_HEIGHT = 560;

export type V12DrawerQueueState = "hidden" | "expanded" | "collapsed" | "autoHidePending";

export type V12TransferDrawerProps = {
  state: V12DrawerQueueState;
  pinned: boolean;
  error: string;
  tasks: TransferTask[];
  summary: string;
  onToggleExpand: () => void;
  onTogglePin: () => void;
  onClearCompleted: () => void;
  onCancelTask: (taskId: string) => void | Promise<void>;
  onStopTask: (taskId: string) => void | Promise<void>;
  onRetryTask: (taskId: string) => void | Promise<void>;
  onRetryFailed: () => void | Promise<void>;
  onCopyError: (taskId: string) => void | Promise<void>;
};

export function V12TransferDrawer(props: V12TransferDrawerProps): ReactElement {
  const expanded = props.state === "expanded" || props.state === "autoHidePending";
  const [filter, setFilter] = useState<"all" | "running" | "failed" | "done">("all");
  const [laneFilter, setLaneFilter] = useState<"all" | "transfer" | "compression" | "delete">("all");
  const [collapsedTasks, setCollapsedTasks] = useState<Record<string, boolean>>({});
  const [paneHeight, setPaneHeight] = useState(() => readJobsPaneHeight());
  const laneFilteredTasks = props.tasks.filter((task) => laneFilter === "all" || taskLane(task) === laneFilter);
  const filteredTasks = laneFilteredTasks.filter((task) => {
    if (filter === "running") return task.status === "running" || task.status === "pending";
    if (filter === "failed") return task.status === "failed";
    if (filter === "done") return task.status === "success" || task.status === "canceled" || task.status === "stopped";
    return true;
  });
  const laneCounts = {
    all: props.tasks.length,
    transfer: props.tasks.filter((task) => taskLane(task) === "transfer").length,
    compression: props.tasks.filter((task) => taskLane(task) === "compression").length,
    delete: props.tasks.filter((task) => taskLane(task) === "delete").length
  };
  const counts = {
    all: laneFilteredTasks.length,
    running: laneFilteredTasks.filter((task) => task.status === "running" || task.status === "pending").length,
    failed: laneFilteredTasks.filter((task) => task.status === "failed").length,
    done: laneFilteredTasks.filter((task) => task.status === "success" || task.status === "canceled" || task.status === "stopped").length
  };
  const laneFilterChips = (
    <div className="v12m-tq-filters v12m-tq-lane-filters" role="tablist" aria-label="Job queue filters" onClick={(event) => event.stopPropagation()}>
      {([
        ["all", "All queues"],
        ["transfer", "Transfer"],
        ["compression", "Compression"],
        ["delete", "Delete"]
      ] as const).map(([item, label]) => (
        <button
          key={item}
          type="button"
          className={`v12m-tq-chip${laneFilter === item ? " is-on" : ""}`}
          onClick={() => setLaneFilter(item)}
        >
          {label} {laneCounts[item]}
        </button>
      ))}
    </div>
  );
  const filterChips = (
    <div className="v12m-tq-filters v12m-tq-status-filters" role="tablist" aria-label="Job status filters" onClick={(event) => event.stopPropagation()}>
      {(["all", "running", "failed", "done"] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={`v12m-tq-chip${filter === item ? " is-on" : ""}`}
          onClick={() => setFilter(item)}
        >
          {item} {counts[item]}
        </button>
      ))}
    </div>
  );
  const actionButtons = expanded ? (
    <div className="v12m-tq-head-actions" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`v12m-tq-btn${props.pinned ? " is-on" : ""}`}
        onClick={() => props.onTogglePin()}
      >
        {props.pinned ? "Pinned" : "Pin"}
      </button>
      <button type="button" className="v12m-tq-btn" onClick={() => props.onClearCompleted()}>
        Clear
      </button>
      <button type="button" className="v12m-tq-btn" onClick={() => void props.onRetryFailed()}>
        Retry failed
      </button>
    </div>
  ) : null;
  const setAndStorePaneHeight = (next: number) => {
    const clamped = clampJobsPaneHeight(next);
    setPaneHeight(clamped);
    writeJobsPaneHeight(clamped);
  };
  const beginPaneResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = paneHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      setAndStorePaneHeight(startHeight + startY - moveEvent.clientY);
    };
    const onUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const handleResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") {
      setAndStorePaneHeight(MIN_JOBS_PANE_HEIGHT);
      return;
    }
    if (event.key === "End") {
      setAndStorePaneHeight(maxJobsPaneHeight());
      return;
    }
    setAndStorePaneHeight(paneHeight + (event.key === "ArrowUp" ? 16 : -16));
  };

  return (
    <div className={`v12m-drawer ${expanded ? "is-open" : "is-collapsed"}`}>
      {expanded ? (
        <div
          className="v12m-drawer-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize Jobs pane"
          aria-orientation="horizontal"
          aria-valuemin={MIN_JOBS_PANE_HEIGHT}
          aria-valuemax={maxJobsPaneHeight()}
          aria-valuenow={paneHeight}
          title="Drag to resize Jobs pane. Double-click to reset."
          onMouseDown={beginPaneResize}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setAndStorePaneHeight(DEFAULT_JOBS_PANE_HEIGHT);
          }}
          onKeyDown={handleResizeKey}
        />
      ) : null}
      <div
        className="v12m-drawer-bar"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => props.onToggleExpand()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onToggleExpand();
          }
        }}
      >
        <span className="v12m-drawer-title">Jobs</span>
        <span className="v12m-drawer-sum">{props.summary}</span>
        {expanded ? laneFilterChips : null}
        {expanded ? filterChips : null}
        {actionButtons}
        <button
          type="button"
          className="v12m-drawer-chev"
          onClick={(event) => {
            event.stopPropagation();
            props.onToggleExpand();
          }}
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>
      {expanded ? (
        <div className="v12m-drawer-panel" style={{ height: `${paneHeight}px`, maxHeight: "none" }}>
          <div className="v12m-tq-panel">
            {props.error ? <div className="cfv12p-error v12m-tq-err">{props.error}</div> : null}
            <div className="v12m-tq-list">
              {filteredTasks.length === 0 ? (
                <div className="v12m-tq-empty">No jobs.</div>
              ) : (
                filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`v12m-tq-row${task.status === "running" ? " v12m-tq-row--running" : ""}`}
                  >
                    <div className="v12m-tq-row-main">
                      <span className={`v12m-tq-badge v12m-tq-badge--${task.status}`}>{task.status}</span>
                      <span className={`v12m-tq-kind v12m-tq-kind--${task.kind}`}>
                        <JobKindIcon task={task} />
                        {jobKindLabel(task)}
                      </span>
                      <span className="v12m-tq-path" title={`${task.sourceDisplay} → ${task.destinationDisplay}`}>
                        {task.sourceDisplay} → {task.destinationDisplay}
                      </span>
                    </div>
                    <div className="v12m-tq-row-meta">{formatTransferTaskMetaLine(task)}</div>
                    {task.itemEntries?.length ? (
                      <div className="v12m-tq-items">
                        <button
                          type="button"
                          className="v12m-tq-items-toggle"
                          onClick={() => setCollapsedTasks((prev) => ({ ...prev, [task.id]: !prev[task.id] }))}
                        >
                          {collapsedTasks[task.id] ? "Show files" : "Hide files"}
                        </button>
                        {collapsedTasks[task.id] ? null : (
                          <div className="v12m-tq-items-list">
                            {sortTransferItems(task.itemEntries).slice(0, 80).map((item) => (
                              <div key={item.relativePath} className={`v12m-tq-item v12m-tq-item--${item.status}`}>
                                <span className="v12m-tq-item-status">{item.status}</span>
                                <span className="v12m-tq-item-path" title={item.displayPath}>{item.displayPath}</span>
                              </div>
                            ))}
                            {task.itemEntries.length > 80 ? (
                              <div className="v12m-tq-item v12m-tq-item--more">+{task.itemEntries.length - 80} more files</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <div className="v12m-tq-row-actions">
                      {task.status === "pending" ? (
                        <button type="button" className="v12m-tq-act" onClick={() => void props.onCancelTask(task.id)}>
                          Cancel
                        </button>
                      ) : null}
                      {task.status === "running" && (task.kind === "upload" || task.kind === "download") ? (
                        <button type="button" className="v12m-tq-act" onClick={() => void props.onStopTask(task.id)}>
                          Stop
                        </button>
                      ) : null}
                      {task.status === "failed" ? (
                        <>
                          <button type="button" className="v12m-tq-act" onClick={() => void props.onRetryTask(task.id)}>
                            Retry
                          </button>
                          <button type="button" className="v12m-tq-act" onClick={() => void props.onCopyError(task.id)}>
                            Copy error
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            {props.state === "autoHidePending" ? (
              <div className="v12m-tq-foot">All tasks completed. Auto-hiding in 10 seconds.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readJobsPaneHeight(): number {
  try {
    const stored = window.localStorage.getItem(JOBS_PANE_HEIGHT_KEY);
    return stored === null ? DEFAULT_JOBS_PANE_HEIGHT : clampJobsPaneHeight(Number(stored));
  } catch {
    return DEFAULT_JOBS_PANE_HEIGHT;
  }
}

function writeJobsPaneHeight(value: number): void {
  try {
    window.localStorage.setItem(JOBS_PANE_HEIGHT_KEY, String(value));
  } catch {
    // Ignore storage failures; resizing should still work for the session.
  }
}

function clampJobsPaneHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_JOBS_PANE_HEIGHT;
  return Math.max(MIN_JOBS_PANE_HEIGHT, Math.min(maxJobsPaneHeight(), Math.round(value)));
}

function maxJobsPaneHeight(): number {
  if (typeof window === "undefined") return MAX_JOBS_PANE_HEIGHT;
  return Math.max(160, Math.min(MAX_JOBS_PANE_HEIGHT, Math.round(window.innerHeight * 0.6)));
}

function jobKindLabel(task: TransferTask): string {
  if (task.kind === "upload") return "Upload";
  if (task.kind === "download") return "Download";
  if (task.kind === "gzip") return "Compress";
  if (task.kind === "decompress") return "Decompress";
  if (task.kind === "md5") return "MD5";
  return "Delete";
}

function taskLane(task: TransferTask): "transfer" | "compression" | "delete" {
  if (task.kind === "upload" || task.kind === "download") return "transfer";
  if (task.kind === "gzip" || task.kind === "decompress" || task.kind === "md5") return "compression";
  return "delete";
}

function JobKindIcon(props: { task: TransferTask }): ReactElement {
  if (props.task.kind === "upload") return <V12TbIcon name="arrow-up-tray" />;
  if (props.task.kind === "download") return <V12TbIcon name="arrow-down-tray" />;
  if (props.task.kind === "delete") return <V12TbIcon name="trash" />;
  if (props.task.kind === "decompress") return <V12TbIcon name="arrow-down-tray" />;
  if (props.task.kind === "md5") return <V12TbIcon name="info-circle" />;
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5.4 5.1h7.7c.75 0 1.35.6 1.35 1.35v3.15H6.75c-.75 0-1.35-.6-1.35-1.35V5.1z" />
      <path d="M4.85 9.3h7.75c.75 0 1.35.6 1.35 1.35v4.25H6.2c-.75 0-1.35-.6-1.35-1.35V9.3z" />
      <path d="M7.3 5.1v4.5M6.75 9.3v5.6" />
    </svg>
  );
}

function sortTransferItems(items: NonNullable<TransferTask["itemEntries"]>): NonNullable<TransferTask["itemEntries"]> {
  const rank = { running: 0, pending: 1, failed: 2, skipped: 3, success: 4 } as const;
  return [...items].sort((a, b) => rank[a.status] - rank[b.status] || a.displayPath.localeCompare(b.displayPath));
}
