import type { FormEvent, ReactElement } from "react";
import { pathToSegments } from "./pathSegments";
import "./v12-pane.css";

export type V12PathBarProps = {
  /** Directory shown in breadcrumb (usually `currentPath`). */
  displayPath: string;
  pathInput: string;
  onPathInputChange: (value: string) => void;
  onSubmitInputPath: () => void;
  onNavigateTo: (path: string) => void;
};

export function V12PathBar(props: V12PathBarProps): ReactElement {
  const segments = pathToSegments(props.displayPath || "/");

  return (
    <div className="cfv12p-pane-chrome">
      <form
        className="cfv12p-path"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          props.onSubmitInputPath();
        }}
      >
        <div className="cfv12p-path-track">
          {segments.map((seg, i) => (
            <span key={`${seg.path}-${i}`} className="cfv12p-path-cell">
              {i > 0 ? <span className="cfv12p-path-chev">›</span> : null}
              <button
                type="button"
                className={`cfv12p-path-seg ${seg.path === props.displayPath ? "is-current" : ""}`}
                title={seg.path}
                onClick={() => props.onNavigateTo(seg.path)}
              >
                {seg.label}
              </button>
            </span>
          ))}
          <div className="cfv12p-path-input-wrap">
            <input
              className="cfv12p-path-input"
              value={props.pathInput}
              onChange={(e) => props.onPathInputChange(e.target.value)}
              aria-label="Path"
              placeholder="Go to folder…"
            />
          </div>
        </div>
      </form>
    </div>
  );
}
