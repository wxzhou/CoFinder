import type { DragEvent, KeyboardEvent, MouseEvent, ReactElement } from "react";
import type { FileEntry } from "../../../shared/types/models";
import { V12Icon } from "./V12Icons";

export type V12VisualIconGridProps<T extends FileEntry> = {
  pane: "local" | "remote";
  isPaneActive: boolean;
  entries: T[];
  selectedFullPaths: string[];
  onItemClick: (entry: T, event: MouseEvent<HTMLButtonElement>) => void;
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
  emptyMessage?: string;
};

export function V12VisualIconGrid<T extends FileEntry>(props: V12VisualIconGridProps<T>): ReactElement {
  return (
    <div
      className="v12m-icon-grid-scroll"
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
      {props.entries.length === 0 ? <div className="v12m-list-empty">{props.emptyMessage ?? "This folder is empty."}</div> : null}
      <div className="v12m-icon-grid" role="list">
        {props.entries.map((entry) => {
          const selected = props.selectedFullPaths.includes(entry.fullPath);
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
                "v12m-icon-item",
                selected ? (props.isPaneActive ? "sel-active" : "sel-inactive") : "",
                props.getItemClassName?.(entry) ?? ""
              ]
                .filter(Boolean)
                .join(" ")}
              title={entry.name}
              onClick={(event) => props.onItemClick(entry, event)}
              onContextMenu={(event) => props.onItemContextMenu(entry, event)}
              onDoubleClick={() => props.onItemDoubleClick(entry)}
              onDragStart={(event) => props.onItemDragStart?.(entry, event)}
              onDragOver={(event) => props.onItemDragOver?.(entry, event)}
              onDrop={(event) => props.onItemDrop?.(entry, event)}
              onDragEnd={(event) => props.onItemDragEnd?.(event)}
            >
              <span className={`v12m-icon-item-ico ${entry.type === "directory" ? "is-dir" : "is-file"}`}>
                <V12Icon name={entry.type === "directory" ? "folder" : "doc"} size="lg" />
              </span>
              {renaming && props.inlineRename ? (
                <input
                  className="v12m-icon-rename-input"
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
                <span className="v12m-icon-item-name">{entry.name}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
