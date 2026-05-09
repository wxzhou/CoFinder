import type { DragEvent, KeyboardEvent, MouseEvent, ReactElement } from "react";
import type { SortDirection, SortKey } from "../../../shared/types/models";
import "./v12-pane.css";

export type V12FileListEntry = {
  fullPath: string;
  name: string;
  type: string;
  size: number;
  mtime: string;
};

export type V12FileListProps = {
  pane: "local" | "remote";
  isPaneActive: boolean;
  entries: V12FileListEntry[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  selectedFullPaths: string[];
  onSort: (key: SortKey) => void;
  onRowClick: (entry: V12FileListEntry, event: MouseEvent<HTMLDivElement>) => void;
  onRowContextMenu: (entry: V12FileListEntry, event: MouseEvent<HTMLDivElement>) => void;
  onRowDoubleClick: (entry: V12FileListEntry) => void;
  onBackgroundMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onBackgroundDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onBackgroundDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onRowDragStart?: (entry: V12FileListEntry, event: DragEvent<HTMLDivElement>) => void;
  onRowDragOver?: (entry: V12FileListEntry, event: DragEvent<HTMLDivElement>) => void;
  onRowDrop?: (entry: V12FileListEntry, event: DragEvent<HTMLDivElement>) => void;
  onRowDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  getRowClassName?: (entry: V12FileListEntry) => string;
  /** Inline rename for one row */
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
  sortMark: (direction: SortDirection) => string;
};

function rowClass(selected: boolean, paneActive: boolean): string {
  if (!selected) return "cfv12p-row";
  return paneActive ? "cfv12p-row cfv12p-row-sel-active" : "cfv12p-row cfv12p-row-sel-inactive";
}

export function V12FileList(props: V12FileListProps): ReactElement {
  return (
    <div className="cfv12p-list-stack">
      <div className="cfv12p-list-head">
        <div className="cfv12p-col-name">
          <button type="button" className="cfv12p-col-btn" onClick={() => props.onSort("name")}>
            Name {props.sortKey === "name" ? props.sortMark(props.sortDirection) : ""}
          </button>
        </div>
        <div>
          <button type="button" className="cfv12p-col-btn" onClick={() => props.onSort("size")}>
            Size {props.sortKey === "size" ? props.sortMark(props.sortDirection) : ""}
          </button>
        </div>
        <div>
          <button type="button" className="cfv12p-col-btn" onClick={() => props.onSort("mtime")}>
            Modified {props.sortKey === "mtime" ? props.sortMark(props.sortDirection) : ""}
          </button>
        </div>
        <div>
          <span className="cfv12p-col-btn" style={{ cursor: "default" }}>
            Kind
          </span>
        </div>
      </div>
      <div
        className="cfv12p-list"
        onMouseDown={props.onBackgroundMouseDown}
        onDragOver={props.onBackgroundDragOver}
        onDrop={props.onBackgroundDrop}
        onDragLeave={props.onDragLeave}
      >
        {props.entries.map((entry) => {
          const selected = props.selectedFullPaths.includes(entry.fullPath);
          const renaming = props.inlineRename?.sourcePath === entry.fullPath;
          return (
            <div
              key={entry.fullPath}
              role="row"
              draggable={!renaming}
              data-pane-row="true"
              data-marquee-pane={props.pane}
              data-full-path={entry.fullPath}
              className={`${rowClass(selected, props.isPaneActive)} ${props.getRowClassName?.(entry) ?? ""}`.trim()}
              onDragStart={(e) => props.onRowDragStart?.(entry, e)}
              onDragOver={(e) => props.onRowDragOver?.(entry, e)}
              onDrop={(e) => props.onRowDrop?.(entry, e)}
              onDragEnd={(e) => props.onRowDragEnd?.(e)}
              onClick={(e) => props.onRowClick(entry, e)}
              onContextMenu={(e) => props.onRowContextMenu(entry, e)}
              onDoubleClick={() => props.onRowDoubleClick(entry)}
            >
              <div className="cfv12p-name">
                <span className="cfv12p-kind" aria-hidden>
                  {entry.type === "directory" ? "▸" : "·"}
                </span>
                {renaming && props.inlineRename ? (
                  <input
                    className="cfv12p-name-input"
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
                  <span className="cfv12p-name-txt" title={entry.name}>
                    {entry.name}
                  </span>
                )}
              </div>
              <div className="cfv12p-cell">{entry.type === "directory" ? "—" : props.formatSize(entry.size)}</div>
              <div className="cfv12p-cell">{props.formatTime(entry.mtime)}</div>
              <div className="cfv12p-kind-label">{entry.type}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
