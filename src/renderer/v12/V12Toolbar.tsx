import type { ReactElement } from "react";
import { V12TbIcon } from "./shared/V12Icons";

export type V12ToolbarProps = {
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onHome: () => void;
  onRefresh: () => void;
  onCopyCurrentPath: () => void;
  backDisabled: boolean;
  forwardDisabled: boolean;
  upDisabled: boolean;
  homeDisabled: boolean;
  refreshDisabled: boolean;
  copyCurrentPathDisabled: boolean;

  /** Disconnected / failed: open Site Manager; connected: disconnect */
  onConnectAction: () => void;
  connectActionDisabled: boolean;
  connectActionTitle: string;
  connectActionAriaLabel: string;

  onUpload: () => void;
  onDownload: () => void;
  onNewFolder: () => void;
  onNewTextFile: () => void;
  uploadDisabled: boolean;
  downloadDisabled: boolean;
  newFolderDisabled: boolean;
  newTextFileDisabled: boolean;

  onDelete: () => void;
  deleteDisabled: boolean;

  onInspectorToggle: () => void;
  inspectorToggleDisabled: boolean;
  inspectorTogglePressed: boolean;

  onPreferences: () => void;

  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
};

/**
 * M5: Finder-style toolbar — every control is wired or explicitly disabled (no dead clicks).
 */
export function V12Toolbar(props: V12ToolbarProps): ReactElement {
  return (
    <div className="v12m-toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="v12m-tg">
        <button
          type="button"
          className="v12m-tb"
          title="Back"
          aria-label="Back"
          disabled={props.backDisabled}
          onClick={() => props.onBack()}
        >
          <V12TbIcon name="chevron-back" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Forward"
          aria-label="Forward"
          disabled={props.forwardDisabled}
          onClick={() => props.onForward()}
        >
          <V12TbIcon name="chevron-forward" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Enclosing folder"
          aria-label="Up"
          disabled={props.upDisabled}
          onClick={() => props.onUp()}
        >
          <V12TbIcon name="chevron-up" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Home"
          aria-label="Home"
          disabled={props.homeDisabled}
          onClick={() => props.onHome()}
        >
          <V12TbIcon name="home" />
        </button>
      </div>
      <span className="v12m-tsep" aria-hidden />
      <div className="v12m-tg">
        <button
          type="button"
          className="v12m-tb"
          title="Refresh"
          aria-label="Refresh"
          disabled={props.refreshDisabled}
          onClick={() => props.onRefresh()}
        >
          <V12TbIcon name="arrow-clockwise" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Copy current path"
          aria-label="Copy current path"
          disabled={props.copyCurrentPathDisabled}
          onClick={() => props.onCopyCurrentPath()}
        >
          <V12TbIcon name="copy" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title={props.connectActionTitle}
          aria-label={props.connectActionAriaLabel}
          disabled={props.connectActionDisabled}
          onClick={() => props.onConnectAction()}
        >
          <V12TbIcon name="plug" />
        </button>
      </div>
      <span className="v12m-tsep" aria-hidden />
      <div className="v12m-tg">
        <button
          type="button"
          className="v12m-tb"
          title="Upload selection to server"
          aria-label="Upload"
          disabled={props.uploadDisabled}
          onClick={() => props.onUpload()}
        >
          <V12TbIcon name="arrow-up-tray" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Download selection to local folder"
          aria-label="Download"
          disabled={props.downloadDisabled}
          onClick={() => props.onDownload()}
        >
          <V12TbIcon name="arrow-down-tray" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="New folder"
          aria-label="New folder"
          disabled={props.newFolderDisabled}
          onClick={() => props.onNewFolder()}
        >
          <V12TbIcon name="folder-badge-plus" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="New text file"
          aria-label="New text file"
          disabled={props.newTextFileDisabled}
          onClick={() => props.onNewTextFile()}
        >
          <V12TbIcon name="doc-badge-plus" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Delete selection"
          aria-label="Delete"
          disabled={props.deleteDisabled}
          onClick={() => props.onDelete()}
        >
          <V12TbIcon name="trash" />
        </button>
      </div>
      <span className="v12m-tsep" aria-hidden />
      <div className="v12m-tg">
        <button
          type="button"
          className="v12m-tb on"
          title="List view"
          aria-label="List"
          disabled
        >
          <V12TbIcon name="list-bullet" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Columns view (not available)"
          aria-label="Columns"
          disabled
        >
          <V12TbIcon name="rectangle-split" />
        </button>
        <button
          type="button"
          className={`v12m-tb${props.inspectorTogglePressed ? " on" : ""}`}
          title="Toggle inspector column"
          aria-label="Toggle inspector"
          aria-pressed={props.inspectorTogglePressed}
          disabled={props.inspectorToggleDisabled}
          onClick={() => props.onInspectorToggle()}
        >
          <V12TbIcon name="sidebar-right" />
        </button>
        <button
          type="button"
          className="v12m-tb"
          title="Preferences"
          aria-label="Preferences"
          onClick={() => props.onPreferences()}
        >
          <V12TbIcon name="gear" />
        </button>
      </div>
      <input
        className="v12m-search"
        placeholder={props.searchPlaceholder}
        value={props.searchValue}
        onChange={(event) => props.onSearchChange(event.target.value)}
        aria-label="Filter current pane"
        title="Filter current pane by name"
      />
    </div>
  );
}
