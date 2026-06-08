import { useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import type { FileEntry, SortDirection, SortKey } from "../../../shared/types/models";
import { V12Icon, V12TbIcon } from "./V12Icons";

/** Alias for callers that only need the shared list shape (extends IPC file entries). */
export type V12VisualFileRow = FileEntry;
export type V12FileColumnKey = "name" | "mtime" | "size" | "kind" | "permissions" | "owner";
export type V12FileColumn = {
  key: V12FileColumnKey;
  label: string;
  width: number;
  visible: boolean;
  required?: boolean;
};

export type V12VisualFileListProps<T extends FileEntry> = {
  pane: "local" | "remote";
  isPaneActive: boolean;
  entries: T[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  selectedFullPaths: string[];
  columns: V12FileColumn[];
  onColumnWidthChange: (key: V12FileColumnKey, width: number) => void;
  onColumnVisibilityChange: (key: V12FileColumnKey, visible: boolean) => void;
  onSort: (key: SortKey) => void;
  onRowClick: (entry: T, event: MouseEvent<HTMLDivElement>) => void;
  onRowDetailClick?: (entry: T, event: MouseEvent<HTMLDivElement>) => void;
  onRowContextMenu: (entry: T, event: MouseEvent<HTMLDivElement>) => void;
  onRowDoubleClick: (entry: T) => void;
  onBackgroundMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onBackgroundContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onBackgroundDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onBackgroundDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onRowDragStart?: (entry: T, event: DragEvent<HTMLDivElement>) => void;
  onRowDragOver?: (entry: T, event: DragEvent<HTMLDivElement>) => void;
  onRowDrop?: (entry: T, event: DragEvent<HTMLDivElement>) => void;
  onRowDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  getRowClassName?: (entry: T) => string;
  inlineRename:
    | {
        sourcePath: string;
        draftName: string;
        onChange: (value: string) => void;
        onBlur: () => void;
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
      }
    | null;
  formatSize: (bytes: number) => string;
  formatTime: (iso: string) => string;
  /** Human-readable kind column (mock uses “Folder” / “Document”). */
  formatKind: (entry: T) => string;
  outline?: {
    enabled: boolean;
    getDepth: (entry: T) => number;
    canExpand: (entry: T) => boolean;
    isExpanded: (entry: T) => boolean;
    isLoading: (entry: T) => boolean;
    getError: (entry: T) => string;
    onToggle: (entry: T, event: MouseEvent<HTMLButtonElement>) => void;
  };
  emptyMessage?: string;
};

function rowSelClass(selected: boolean, paneActive: boolean): string {
  if (!selected) return "";
  return paneActive ? "sel-active" : "sel-inactive";
}

export function V12VisualFileList<T extends FileEntry>(props: V12VisualFileListProps<T>): ReactElement {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const visibleColumns = props.columns.filter((column) => column.visible || column.required);
  const gridTemplateColumns = visibleColumns.map((column) => `${column.width}px`).join(" ");
  const gridStyle: CSSProperties = { gridTemplateColumns, minWidth: "100%", width: "max-content" };
  const startResize = (column: V12FileColumn, event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = column.width;
    const minWidth = column.key === "name" ? 160 : column.key === "mtime" ? 112 : 72;
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      props.onColumnWidthChange(column.key, Math.max(minWidth, startWidth + moveEvent.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const renderSort = (key: V12FileColumnKey) => {
    if (key !== props.sortKey) return null;
    return <V12TbIcon name={props.sortDirection === "asc" ? "sort-asc" : "sort-desc"} />;
  };
  const sortKeyForColumn = (key: V12FileColumnKey): SortKey | null => {
    if (key === "name" || key === "mtime" || key === "size") return key;
    return null;
  };
  const cellValue = (entry: T, key: V12FileColumnKey): ReactElement | string => {
    const row = entry as FileEntry & { permissions?: string; owner?: string };
    if (key === "name") {
      const isDir = entry.type === "directory";
      const renaming = props.inlineRename?.sourcePath === entry.fullPath;
      const outline = props.outline?.enabled ? props.outline : null;
      const depth = outline?.getDepth(entry) ?? 0;
      const canExpand = outline?.canExpand(entry) ?? false;
      const loading = outline?.isLoading(entry) ?? false;
      const expanded = outline?.isExpanded(entry) ?? false;
      const outlineError = outline?.getError(entry) ?? "";
      return (
        <div className="v12m-lname" style={{ "--outline-depth": depth } as CSSProperties}>
          {outline ? (
            canExpand ? (
              <button
                type="button"
                className={`v12m-disclosure${expanded ? " is-open" : ""}${loading ? " is-loading" : ""}${outlineError ? " has-error" : ""}`}
                title={outlineError || (expanded ? "Collapse folder" : "Expand folder")}
                aria-label={expanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
                aria-expanded={expanded}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => outline.onToggle(entry, event)}
              >
                <svg className="v12m-disclosure-svg" viewBox="0 0 12 12" aria-hidden>
                  <path d={expanded ? "M3 4.45h6L6 7.55z" : "M4.45 3l3.1 3-3.1 3z"} />
                </svg>
              </button>
            ) : (
              <span className="v12m-disclosure-spacer" aria-hidden />
            )
          ) : null}
          <span className={`v12m-file-ico ${isDir ? "v12m-file-ico--dir" : "v12m-file-ico--file"}`}>
            <V12Icon name={isDir ? "folder" : "doc"} />
          </span>
          {renaming && props.inlineRename ? (
            <input
              className="v12m-lname-txt v12m-lname-input"
              style={{ border: "1px solid rgba(10,132,255,0.35)", borderRadius: 4, padding: "0 4px" }}
              autoFocus
              value={props.inlineRename.draftName}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => props.inlineRename?.onChange(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={() => props.inlineRename?.onBlur()}
              onKeyDown={(e) => props.inlineRename?.onKeyDown(e)}
            />
          ) : (
            <span className="v12m-lname-txt" title={entry.name}>
              {entry.name}
            </span>
          )}
        </div>
      );
    }
    if (key === "mtime") return props.formatTime(entry.mtime);
    if (key === "size") return entry.type === "directory" ? "—" : props.formatSize(entry.size);
    if (key === "kind") return props.formatKind(entry);
    if (key === "permissions") return row.permissions || "—";
    if (key === "owner") return row.owner || "—";
    return "—";
  };
  return (
    <div
      className="v12m-file-grid-scroll"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-pane-row],.v12m-list,.v12m-list-head,.v12m-column-menu,button,input,textarea,select")) return;
        props.onBackgroundMouseDown(event);
      }}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-pane-row],.v12m-list,.v12m-list-head,.v12m-column-menu")) return;
        props.onBackgroundContextMenu?.(event);
      }}
    >
      <div
        className="v12m-list-head"
        style={gridStyle}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {visibleColumns.map((column) => {
          const sortKey = sortKeyForColumn(column.key);
          return (
            <span key={column.key} className={`v12m-hcell v12m-hcell--${column.key}`}>
              <button
                type="button"
                className="v12m-pathfinder-seg v12m-hbtn"
                disabled={!sortKey}
                onClick={() => {
                  if (sortKey) props.onSort(sortKey);
                }}
              >
                <span>{column.label}</span>
                {renderSort(column.key)}
              </button>
              <span className="v12m-col-resize" role="separator" aria-hidden onMouseDown={(event) => startResize(column, event)} />
            </span>
          );
        })}
      </div>
      {menu ? (
        <div className="v12m-column-menu" style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
          {props.columns.map((column) => {
            const checked = column.visible || column.required;
            return (
              <button
                key={column.key}
                type="button"
                className="v12m-column-menu-item"
                disabled={column.required}
                onClick={() => {
                  if (!column.required) props.onColumnVisibilityChange(column.key, !column.visible);
                  setMenu(null);
                }}
              >
                <span className={column.required ? "is-muted" : ""}>{checked ? <V12TbIcon name="check" /> : null}</span>
                {column.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        className="v12m-list"
        role="list"
        onMouseDown={props.onBackgroundMouseDown}
        onContextMenu={props.onBackgroundContextMenu}
        onDragOver={props.onBackgroundDragOver}
        onDrop={props.onBackgroundDrop}
        onDragLeave={props.onDragLeave}
      >
        {props.entries.length === 0 ? <div className="v12m-list-empty">{props.emptyMessage ?? "This folder is empty."}</div> : null}
        {props.entries.map((entry, index) => {
          const selected = props.selectedFullPaths.includes(entry.fullPath);
          const sel = rowSelClass(selected, props.isPaneActive);
          const previousSelected = index > 0 ? props.selectedFullPaths.includes(props.entries[index - 1].fullPath) : false;
          const nextSelected = index < props.entries.length - 1 ? props.selectedFullPaths.includes(props.entries[index + 1].fullPath) : false;
          const selectedRunClass = selected
            ? `${previousSelected ? "" : " sel-run-start"}${nextSelected ? "" : " sel-run-end"}`
            : "";
          return (
            <div
              key={entry.fullPath}
              role="listitem"
              draggable={props.inlineRename?.sourcePath !== entry.fullPath}
              data-pane-row="true"
              data-marquee-pane={props.pane}
              data-full-path={entry.fullPath}
              className={`v12m-lrow ${sel}${selectedRunClass} ${props.getRowClassName?.(entry) ?? ""}`.trim()}
              style={gridStyle}
              onDragStart={(e) => props.onRowDragStart?.(entry, e)}
              onDragOver={(e) => props.onRowDragOver?.(entry, e)}
              onDrop={(e) => props.onRowDrop?.(entry, e)}
              onDragEnd={(e) => props.onRowDragEnd?.(e)}
              onClick={(e) => {
                const target = e.target as HTMLElement | null;
                if (target?.closest(".v12m-lname")) {
                  props.onRowClick(entry, e);
                  return;
                }
                props.onRowDetailClick?.(entry, e);
              }}
              onContextMenu={(e) => props.onRowContextMenu(entry, e)}
              onDoubleClick={() => props.onRowDoubleClick(entry)}
            >
              {visibleColumns.map((column) => (
                <span key={column.key} className={column.key === "name" ? "v12m-namecell" : `v12m-lcell v12m-lcell--${column.key}`}>
                  {cellValue(entry, column.key)}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
