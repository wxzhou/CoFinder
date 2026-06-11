import type { DragEvent, KeyboardEvent, MouseEvent, ReactElement } from "react";
import type { FileEntry } from "../../../shared/types/models";
import { V12FileTypeIcon } from "./V12FileTypeIcon";

export type V12GalleryPreview = {
  status: "idle" | "loading" | "ready" | "error";
  kind?: "text" | "image";
  content?: string;
  imageDataUrl?: string;
  mimeType?: string;
  error?: string;
  truncated?: boolean;
};

export type V12VisualGalleryViewProps<T extends FileEntry> = {
  pane: "local" | "remote";
  isPaneActive: boolean;
  entries: T[];
  selectedFullPaths: string[];
  preview: V12GalleryPreview;
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
  formatSize: (bytes: number) => string;
  formatTime: (iso: string) => string;
  formatKind: (entry: T) => string;
};

export function V12VisualGalleryView<T extends FileEntry>(props: V12VisualGalleryViewProps<T>): ReactElement {
  const selected = props.entries.find((entry) => props.selectedFullPaths[0] === entry.fullPath);
  const renderPreviewContent = () => {
    if (!selected) return <div className="v12m-gallery-preview-empty">Select one file to preview it.</div>;
    if (selected.type === "directory") {
      return (
        <div className="v12m-gallery-preview-placeholder">
          <V12FileTypeIcon entry={selected} size="lg" />
          <span>Double-click to open this folder.</span>
        </div>
      );
    }
    if (props.preview.status === "loading") return <div className="v12m-gallery-preview-placeholder">Loading preview...</div>;
    if (props.preview.status === "ready" && props.preview.kind === "image" && props.preview.imageDataUrl) {
      return <img className="v12m-gallery-preview-image" src={props.preview.imageDataUrl} alt={selected.name} />;
    }
    if (props.preview.status === "ready" && props.preview.kind === "text") {
      return (
        <pre className="v12m-gallery-preview-text">
          {props.preview.content}
          {props.preview.truncated ? "\n\n..." : ""}
        </pre>
      );
    }
    if (props.preview.status === "error") {
      return <div className="v12m-gallery-preview-placeholder">{props.preview.error || "Preview unavailable."}</div>;
    }
    return <div className="v12m-gallery-preview-placeholder">Select a file to preview it.</div>;
  };

  const renderThumb = (entry: T, selectedThumb: boolean) => {
    if (selectedThumb && props.preview.status === "ready" && props.preview.kind === "image" && props.preview.imageDataUrl) {
      return <img className="v12m-gallery-thumb-image" src={props.preview.imageDataUrl} alt="" />;
    }
    if (selectedThumb && props.preview.status === "ready" && props.preview.kind === "text") {
      return (
        <span className="v12m-gallery-thumb-text" aria-hidden>
          {(props.preview.content ?? "").slice(0, 80)}
        </span>
      );
    }
    return <V12FileTypeIcon entry={entry} size="md" />;
  };

  return (
    <div
      className="v12m-gallery"
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
      <div className="v12m-gallery-main">{renderPreviewContent()}</div>
      <aside className="v12m-gallery-info">
        {selected ? (
          <>
            <div className="v12m-gallery-preview-hero">
              {props.preview.status === "ready" && props.preview.kind === "image" && props.preview.imageDataUrl ? (
                <img src={props.preview.imageDataUrl} alt="" />
              ) : (
                <V12FileTypeIcon entry={selected} size="lg" />
              )}
            </div>
            <div className="v12m-gallery-preview-title">{selected.name}</div>
            <div className="v12m-gallery-preview-meta">
              <span>{props.formatKind(selected)}</span>
              <span>{selected.type === "directory" ? "Folder" : props.formatSize(selected.size)}</span>
              <span>{props.formatTime(selected.mtime)}</span>
            </div>
          </>
        ) : (
          <div className="v12m-gallery-preview-empty">Select one file to preview it.</div>
        )}
      </aside>
      <div className="v12m-gallery-strip" role="list">
        {props.entries.length === 0 ? <div className="v12m-list-empty">This folder is empty.</div> : null}
        {props.entries.map((entry) => {
          const itemSelected = props.selectedFullPaths.includes(entry.fullPath);
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
                "v12m-gallery-item",
                itemSelected ? (props.isPaneActive ? "sel-active" : "sel-inactive") : "",
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
              <span className="v12m-gallery-thumb">{renderThumb(entry, itemSelected)}</span>
              {renaming && props.inlineRename ? (
                <input
                  className="v12m-gallery-rename-input"
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
                <span className="v12m-gallery-item-name">{entry.name}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
