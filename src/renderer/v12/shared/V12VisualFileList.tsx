import type { KeyboardEvent, MouseEvent, ReactElement } from "react";
import type { SortDirection, SortKey } from "../../../shared/types/models";
import { V12Icon } from "./V12Icons";

export type V12VisualFileRow = {
  fullPath: string;
  name: string;
  type: string;
  size: number;
  mtime: string;
};

export type V12VisualFileListProps = {
  isPaneActive: boolean;
  entries: V12VisualFileRow[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  selectedFullPaths: string[];
  onSort: (key: SortKey) => void;
  onRowClick: (entry: V12VisualFileRow, event: MouseEvent<HTMLDivElement>) => void;
  onRowContextMenu: (entry: V12VisualFileRow, event: MouseEvent<HTMLDivElement>) => void;
  onRowDoubleClick: (entry: V12VisualFileRow) => void;
  onBackgroundMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
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
  /** Human-readable kind column (mock uses “Folder” / “Document”). */
  formatKind: (entry: V12VisualFileRow) => string;
};

function rowSelClass(selected: boolean, paneActive: boolean): string {
  if (!selected) return "";
  return paneActive ? "sel-active" : "sel-inactive";
}

export function V12VisualFileList(props: V12VisualFileListProps): ReactElement {
  return (
    <>
      <div className="v12m-list-head">
        <span className="v12m-col-name">
          <button type="button" className="v12m-pathfinder-seg" style={{ padding: 0, textAlign: "left" }} onClick={() => props.onSort("name")}>
            Name {props.sortKey === "name" ? props.sortMark(props.sortDirection) : ""}
          </button>
        </span>
        <span>
          <button type="button" className="v12m-pathfinder-seg" style={{ padding: 0 }} onClick={() => props.onSort("mtime")}>
            Date modified {props.sortKey === "mtime" ? props.sortMark(props.sortDirection) : ""}
          </button>
        </span>
        <span>
          <button type="button" className="v12m-pathfinder-seg" style={{ padding: 0 }} onClick={() => props.onSort("size")}>
            Size {props.sortKey === "size" ? props.sortMark(props.sortDirection) : ""}
          </button>
        </span>
        <span className="v12m-kind">Kind</span>
      </div>
      <div className="v12m-list" role="list" onMouseDown={props.onBackgroundMouseDown}>
        {props.entries.map((entry) => {
          const selected = props.selectedFullPaths.includes(entry.fullPath);
          const sel = rowSelClass(selected, props.isPaneActive);
          const renaming = props.inlineRename?.sourcePath === entry.fullPath;
          const isDir = entry.type === "directory";
          return (
            <div
              key={entry.fullPath}
              role="listitem"
              className={`v12m-lrow ${sel}`.trim()}
              onClick={(e) => props.onRowClick(entry, e)}
              onContextMenu={(e) => props.onRowContextMenu(entry, e)}
              onDoubleClick={() => props.onRowDoubleClick(entry)}
            >
              <div className="v12m-lname">
                <span className={`v12m-file-ico ${isDir ? "v12m-file-ico--dir" : "v12m-file-ico--file"}`}>
                  <V12Icon name={isDir ? "folder" : "doc"} />
                </span>
                {renaming && props.inlineRename ? (
                  <input
                    className="v12m-lname-txt"
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
              <span className="v12m-lcell">{props.formatTime(entry.mtime)}</span>
              <span className="v12m-lcell">{isDir ? "—" : props.formatSize(entry.size)}</span>
              <span className="v12m-lcell v12m-kind">{props.formatKind(entry)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
