import type { ReactElement, ReactNode } from "react";

function normPath(p: string): string {
  const x = (p || "").replace(/\/+/g, "/").trim() || "/";
  if (x === "/") return "/";
  return x.replace(/\/+$/, "") || "/";
}

export type V12PathSegment = { label: string; path: string };

export type V12VisualLocationStripProps = {
  title: string;
  meta: string;
  segments: V12PathSegment[];
  /** Compare to mark current segment (usually `currentPath` from pane state). */
  currentPath: string;
  pathRootLabel?: string;
  onNavigate: (path: string) => void;
  badge?: ReactNode;
  /** Right side of header row (e.g. Disconnect). */
  trailing?: ReactNode;
};

export function V12VisualLocationStrip(props: V12VisualLocationStripProps): ReactElement {
  const n = props.segments.length;
  return (
    <div className="v12m-loc">
      <div className="v12m-loc-head">
        <div className="v12m-loc-titles">
          <span className="v12m-loc-title">{props.title}</span>
          <span className="v12m-loc-meta">{props.meta}</span>
        </div>
        <div className="v12m-loc-tail">
          {props.badge ?? null}
          {props.trailing ?? null}
        </div>
      </div>
      <div className="v12m-pathfinder" role="navigation" aria-label="Path">
        <div className="v12m-pathfinder-track">
          {props.segments.map((seg, i) => {
            const label = i === 0 && props.pathRootLabel ? props.pathRootLabel : seg.label;
            const isCurrent = normPath(seg.path) === normPath(props.currentPath);
            return (
              <span key={`${seg.path}-${i}`} className="v12m-pathfinder-cell">
                {i > 0 ? (
                  <span className="v12m-pathfinder-chev" aria-hidden>
                    ›
                  </span>
                ) : null}
                <button
                  type="button"
                  className={`v12m-pathfinder-seg ${isCurrent ? "is-current" : ""}`}
                  title={seg.path}
                  onClick={() => props.onNavigate(seg.path)}
                >
                  {label}
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
