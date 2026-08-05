import type { ReactElement, ReactNode } from "react";
import "./v12-shell.css";
import "./v12-production-mock-parity.css";
import { V12DefaultSidebar, V12TbIcon } from "./shared/V12Icons";

/** M5: wire each control to real handlers; until then all buttons stay `disabled` (no dead clicks). */
function mockToolbar(): ReactElement {
  return (
    <div className="v12m-toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="v12m-tg">
        <button type="button" className="v12m-tb" title="Back" aria-label="Back" disabled>
          <V12TbIcon name="chevron-back" />
        </button>
        <button type="button" className="v12m-tb" title="Forward" aria-label="Forward" disabled>
          <V12TbIcon name="chevron-forward" />
        </button>
        <button type="button" className="v12m-tb" title="Enclosing folder" aria-label="Up" disabled>
          <V12TbIcon name="chevron-up" />
        </button>
      </div>
      <span className="v12m-tsep" aria-hidden />
      <div className="v12m-tg">
        <button type="button" className="v12m-tb" title="Refresh" aria-label="Refresh" disabled>
          <V12TbIcon name="arrow-clockwise" />
        </button>
        <button type="button" className="v12m-tb" title="Connect" aria-label="Connect" disabled>
          <V12TbIcon name="plug" />
        </button>
      </div>
      <span className="v12m-tsep" aria-hidden />
      <div className="v12m-tg">
        <button type="button" className="v12m-tb" title="Upload" aria-label="Upload" disabled>
          <V12TbIcon name="arrow-up-tray" />
        </button>
        <button type="button" className="v12m-tb" title="Download" aria-label="Download" disabled>
          <V12TbIcon name="arrow-down-tray" />
        </button>
        <button type="button" className="v12m-tb" title="New folder" aria-label="New folder" disabled>
          <V12TbIcon name="folder-badge-plus" />
        </button>
        <button type="button" className="v12m-tb" title="Delete" aria-label="Delete" disabled>
          <V12TbIcon name="trash" />
        </button>
        <button type="button" className="v12m-tb" title="Get info" aria-label="Get info" disabled>
          <V12TbIcon name="info-circle" />
        </button>
      </div>
      <span className="v12m-tsep" aria-hidden />
      <div className="v12m-tg">
        <button type="button" className="v12m-tb on" title="List" aria-label="List" disabled>
          <V12TbIcon name="list-bullet" />
        </button>
        <button type="button" className="v12m-tb" title="Columns" aria-label="Columns" disabled>
          <V12TbIcon name="rectangle-split" />
        </button>
      </div>
      <input className="v12m-search" placeholder="Search" readOnly aria-label="Search" />
    </div>
  );
}

export type AppShellV12Props = {
  titleTabs: ReactNode;
  titleLeading?: ReactNode;
  sidebar?: ReactNode;
  /** `null` = no top strip. Omit for no default banner. */
  banner?: ReactNode | null;
  toolbar?: ReactNode | null;
  localPane: ReactNode;
  remotePane: ReactNode;
  splitter?: ReactNode | null;
  drawer: ReactNode;
  /** Fixed corner dev hint; keep out of hero chrome. */
  devHint?: ReactNode | null;
};

/**
 * V1.2 Finder-first layout shell — uses approved mockup CSS (`v12m-*`) for visual parity (M2.6).
 */
export function AppShellV12(props: AppShellV12Props): ReactElement {
  const sidebar = props.sidebar !== undefined ? props.sidebar : <V12DefaultSidebar />;
  const banner = props.banner === undefined ? null : props.banner;
  const toolbar = props.toolbar === undefined ? mockToolbar() : props.toolbar;

  return (
    <div className="cfv12-root v12m-root">
      <header
        className="cfv12-titlestrip v12m-titlestrip"
        aria-label="Window title and tabs"
        data-tauri-drag-region
      >
        {/* Decorative traffic lights live only in `V12UiMockup` (?mockup=v12). Electron provides real lights. */}
        {props.titleLeading ? <div className="cfv12-title-leading">{props.titleLeading}</div> : null}
        <div className="cfv12-tabsHost v12m-titlebar-tabs">{props.titleTabs}</div>
      </header>

      <div className="cfv12-core v12m-core">
        {sidebar}
        <div className="cfv12-main v12m-mainstack">
          {banner}
          {toolbar}
          <div className="cfv12-split v12m-split" aria-label="Dual pane workspace">
            {props.localPane}
            {props.splitter ?? null}
            {props.remotePane}
          </div>
          {props.drawer}
        </div>
      </div>
      {props.devHint ?? null}
    </div>
  );
}
