import { useState, type ReactElement } from "react";
import type { TransferTask } from "../../shared/types/models";
import { formatTransferTaskMetaLine } from "./v12TransferRowSummary";

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
  const [collapsedTasks, setCollapsedTasks] = useState<Record<string, boolean>>({});
  const filteredTasks = props.tasks.filter((task) => {
    if (filter === "running") return task.status === "running" || task.status === "pending";
    if (filter === "failed") return task.status === "failed";
    if (filter === "done") return task.status === "success" || task.status === "canceled" || task.status === "stopped";
    return true;
  });
  const counts = {
    all: props.tasks.length,
    running: props.tasks.filter((task) => task.status === "running" || task.status === "pending").length,
    failed: props.tasks.filter((task) => task.status === "failed").length,
    done: props.tasks.filter((task) => task.status === "success" || task.status === "canceled" || task.status === "stopped").length
  };
  const filterChips = (
    <div className="v12m-tq-filters" role="tablist" aria-label="Transfer task filters" onClick={(event) => event.stopPropagation()}>
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

  return (
    <div className={`v12m-drawer ${expanded ? "is-open" : "is-collapsed"}`}>
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
        <span className="v12m-drawer-title">Transfers</span>
        <span className="v12m-drawer-sum">{props.summary}</span>
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
        <div className="v12m-drawer-panel">
          <div className="v12m-tq-panel">
            {props.error ? <div className="cfv12p-error v12m-tq-err">{props.error}</div> : null}
            <div className="v12m-tq-list">
              {filteredTasks.length === 0 ? (
                <div className="v12m-tq-empty">No transfer tasks.</div>
              ) : (
                filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`v12m-tq-row${task.status === "running" ? " v12m-tq-row--running" : ""}`}
                  >
                    <div className="v12m-tq-row-main">
                      <span className={`v12m-tq-badge v12m-tq-badge--${task.status}`}>{task.status}</span>
                      <span className="v12m-tq-dir">{task.direction}</span>
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
                      {task.status === "running" ? (
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

function sortTransferItems(items: NonNullable<TransferTask["itemEntries"]>): NonNullable<TransferTask["itemEntries"]> {
  const rank = { running: 0, pending: 1, failed: 2, skipped: 3, success: 4 } as const;
  return [...items].sort((a, b) => rank[a.status] - rank[b.status] || a.displayPath.localeCompare(b.displayPath));
}
