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
          title="Copy current path (⌘⌥C)"
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
      <div className="v12m-tg">
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
