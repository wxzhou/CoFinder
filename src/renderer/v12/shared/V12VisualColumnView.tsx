import type { DragEvent, KeyboardEvent, MouseEvent, ReactElement } from "react";
import type { FileEntry } from "../../../shared/types/models";
import { groupEntriesByFileType } from "../fileTypeGroups";
import { V12FileTypeIcon } from "./V12FileTypeIcon";
import { V12TbIcon } from "./V12Icons";

export type V12Column<T extends FileEntry> = {
  path: string;
  title: string;
  entries: T[];
  status?: "idle" | "loading" | "ready" | "error";
  error?: string;
};

export type V12VisualColumnViewProps<T extends FileEntry> = {
  pane: "local" | "remote";
  isPaneActive: boolean;
  columns: Array<V12Column<T>>;
  groupByType?: boolean;
  selectedFullPaths: string[];
  selectedColumnPaths: string[];
  onItemClick: (entry: T, columnIndex: number, event: MouseEvent<HTMLButtonElement>) => void;
  onItemContextMenu: (entry: T, event: MouseEvent<HTMLButtonElement>) => void;
  onItemDoubleClick: (entry: T) => void;
  onBackgroundMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onBackgroundContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onBackgroundDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onBackgroundDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onItemDragStart?: (entry: T, event: DragEvent<HTMLButtonElement>) => void;
  onItemDragOver?: (entry: T, event: DragEvent<HTMLButtonElement>) => void;
  onItemDrop?: (entry: T, event: DragEvent<HTMLButtonElement>) => void;
  onItemDragEnd?: (event: DragEvent<HTMLButtonElement>) => void;
  getItemClassName?: (entry: T) => string;
  inlineRename:
    | {
        sourcePath: string;
        draftName: string;
        onChange: (value: string) => void;
        onBlur: () => void;
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
      }
    | null;
};

export function V12VisualColumnView<T extends FileEntry>(props: V12VisualColumnViewProps<T>): ReactElement {
  return (
    <div
      className="v12m-column-view-scroll"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-pane-row],button,input,textarea,select")) return;
        props.onBackgroundMouseDown(event);
      }}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-pane-row],button,input,textarea,select")) return;
        props.onBackgroundContextMenu?.(event);
      }}
      onDragOver={props.onBackgroundDragOver}
      onDrop={props.onBackgroundDrop}
      onDragLeave={props.onDragLeave}
    >
      <div className="v12m-column-view" role="list">
        {props.columns.map((column, columnIndex) => (
          <section className="v12m-column" key={`${column.path}-${columnIndex}`} aria-label={column.title}>
            <div className="v12m-column-title">{column.title}</div>
            {column.status === "loading" ? <div className="v12m-column-hint">Loading...</div> : null}
            {column.status === "error" ? <div className="v12m-column-hint is-error">{column.error || "Could not load folder."}</div> : null}
            {column.entries.length === 0 && column.status !== "loading" ? <div className="v12m-column-hint">Empty</div> : null}
            {(props.groupByType ? groupEntriesByFileType(column.entries) : [{ id: "all", label: "", entries: column.entries }]).map((group) => (
              <div className="v12m-column-type-group" key={group.id}>
                {props.groupByType ? <div className="v12m-file-type-heading v12m-column-type-heading">{group.label}</div> : null}
                {group.entries.map((entry) => {
                  const selected = props.selectedFullPaths.includes(entry.fullPath);
                  const pathSelected = props.selectedColumnPaths[columnIndex] === entry.fullPath;
                  const renaming = props.inlineRename?.sourcePath === entry.fullPath;
                  return (
                    <button
                      key={entry.fullPath}
                      type="button"
                      role="listitem"
                      draggable={!renaming}
                      data-pane-row="true"
                      data-marquee-pane={props.pane}
                      data-full-path={entry.fullPath}
                      className={[
                        "v12m-column-item",
                        selected ? (props.isPaneActive ? "sel-active" : "sel-inactive") : "",
                        pathSelected ? "is-path-selected" : "",
                        props.getItemClassName?.(entry) ?? ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={entry.name}
                      onClick={(event) => props.onItemClick(entry, columnIndex, event)}
                      onContextMenu={(event) => props.onItemContextMenu(entry, event)}
                      onDoubleClick={() => props.onItemDoubleClick(entry)}
                      onDragStart={(event) => props.onItemDragStart?.(entry, event)}
                      onDragOver={(event) => props.onItemDragOver?.(entry, event)}
                      onDrop={(event) => props.onItemDrop?.(entry, event)}
                      onDragEnd={(event) => props.onItemDragEnd?.(event)}
                    >
                      <span className="v12m-column-item-icon">
                        <V12FileTypeIcon entry={entry} size="sm" />
                      </span>
                      {renaming && props.inlineRename ? (
                        <input
                          className="v12m-column-rename-input"
                          autoFocus
                          value={props.inlineRename.draftName}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => props.inlineRename?.onChange(event.target.value)}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onBlur={() => props.inlineRename?.onBlur()}
                          onKeyDown={(event) => props.inlineRename?.onKeyDown(event)}
                        />
                      ) : (
                        <span className="v12m-column-item-name">{entry.name}</span>
                      )}
                      {entry.type === "directory" ? (
                        <span className="v12m-column-item-arrow">
                          <V12TbIcon name="chevron-forward" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
