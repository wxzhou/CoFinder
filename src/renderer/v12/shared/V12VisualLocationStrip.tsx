import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { V12TbIcon } from "./V12Icons";

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
  editingPath?: boolean;
  pathInput?: string;
  pathInputDisabled?: boolean;
  onBeginPathInput?: () => void;
  onPathInputChange?: (value: string) => void;
  onSubmitPathInput?: () => void;
  onCancelPathInput?: () => void;
  onCopyPath?: () => void;
  badge?: ReactNode;
  /** Right side of header row (e.g. Disconnect). */
  trailing?: ReactNode;
};

export function V12VisualLocationStrip(props: V12VisualLocationStripProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.editingPath) return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [props.editingPath]);

  return (
    <div className="v12m-loc">
      <div className="v12m-loc-head">
        <div className="v12m-loc-titles">
          <span className="v12m-loc-title-row">
            <span className="v12m-loc-title">{props.title}</span>
            {props.badge ?? null}
          </span>
          <span className="v12m-loc-meta">{props.meta}</span>
        </div>
        {props.trailing ? <div className="v12m-loc-tail">{props.trailing}</div> : null}
      </div>
      <div className="v12m-pathline">
        {props.editingPath ? (
          <form
            className="v12m-path-edit"
            onSubmit={(event) => {
              event.preventDefault();
              props.onSubmitPathInput?.();
            }}
          >
            <input
              ref={inputRef}
              value={props.pathInput ?? props.currentPath}
              disabled={props.pathInputDisabled}
              onChange={(event) => props.onPathInputChange?.(event.target.value)}
              onBlur={() => props.onCancelPathInput?.()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  props.onCancelPathInput?.();
                }
              }}
              aria-label="Path"
            />
          </form>
        ) : (
          <div
            className="v12m-pathfinder"
            role="navigation"
            aria-label="Path"
            title={props.currentPath}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) props.onBeginPathInput?.();
            }}
            onDoubleClick={() => props.onBeginPathInput?.()}
          >
            <div
              className="v12m-pathfinder-track"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) props.onBeginPathInput?.();
              }}
            >
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
        )}
        <button type="button" className="v12m-path-copy" title="Copy path" aria-label="Copy path" onClick={() => props.onCopyPath?.()}>
          <V12TbIcon name="copy" />
        </button>
      </div>
    </div>
  );
}
