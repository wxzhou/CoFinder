import { useState, type CSSProperties, type ReactElement } from "react";
import "./v12-mockup.css";
import {
  MOCK_BREADCRUMB_LOCAL,
  MOCK_BREADCRUMB_REMOTE,
  MOCK_LIST_LOCAL,
  MOCK_LIST_REMOTE,
  MOCK_QUEUE,
  MOCK_REMOTE_META,
  MOCK_SIDEBAR,
  MOCK_WINDOW_TABS,
  type MockListRow
} from "./mockData";

type PaneScenario = "browse" | "empty" | "loading" | "error";
type RemoteScenario = "normal" | "disconnected" | "loading" | "error";
type InspectorMode = "off" | "local" | "remote" | "active";

function Icon(props: { name: "disk" | "folder" | "server" | "clock" | "doc"; size?: "sm" | "md" | "lg" }): ReactElement {
  const { name, size = "md" } = props;
  const px = size === "sm" ? 16 : size === "lg" ? 22 : 20;
  const vb = 20;
  const c = {
    width: px,
    height: px,
    viewBox: `0 0 ${vb} ${vb}`,
    fill: "currentColor",
    "aria-hidden": true as const
  };
  if (name === "doc") {
    return (
      <svg {...c} className="v12m-svg-doc">
        <path d="M5 3.5h6.5L14 6v10.5H5V3.5z" fill="#fafafa" stroke="rgba(60,60,67,0.42)" strokeWidth="1.1" />
        <path d="M11.5 3.5V7H14" fill="none" stroke="rgba(60,60,67,0.32)" strokeWidth="1.05" />
      </svg>
    );
  }
  if (name === "folder") {
    return (
      <svg {...c} className="v12m-svg-folder">
        <path
          d="M3.25 5.25c0-.55.45-1 1-1h2.2l.85.85h6.45c.55 0 1 .45 1 1v8.5c0 .55-.45 1-1 1h-9.5c-.55 0-1-.45-1-1v-8.35z"
          fill="#7eb6ec"
        />
        <path d="M3.25 6.5h13.5v7.1c0 .55-.45 1-1 1h-11.5c-.55 0-1-.45-1-1V6.5z" fill="#4d92d9" />
      </svg>
    );
  }
  if (name === "server") {
    return (
      <svg {...c} className="v12m-svg-server">
        <rect x="3" y="4" width="14" height="3.2" rx="0.75" fill="rgba(60,60,67,0.35)" />
        <rect x="3" y="8.4" width="14" height="3.2" rx="0.75" fill="rgba(60,60,67,0.22)" />
        <rect x="3" y="12.8" width="14" height="3.2" rx="0.75" fill="rgba(60,60,67,0.14)" />
        <circle cx="4.8" cy="5.6" r="0.55" fill="rgba(255,255,255,0.65)" />
        <circle cx="4.8" cy="10" r="0.55" fill="rgba(255,255,255,0.5)" />
        <circle cx="4.8" cy="14.4" r="0.55" fill="rgba(255,255,255,0.4)" />
      </svg>
    );
  }
  if (name === "disk") {
    return (
      <svg {...c} className="v12m-svg-disk">
        <ellipse cx="10" cy="10" rx="7.2" ry="7.5" fill="rgba(60,60,67,0.08)" />
        <path
          d="M10 3.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 11.75a5.25 5.25 0 110-10.5 5.25 5.25 0 010 10.5z"
          fill="none"
          stroke="rgba(60,60,67,0.5)"
          strokeWidth="1.05"
        />
        <circle cx="10" cy="10" r="2.2" fill="rgba(60,60,67,0.18)" />
      </svg>
    );
  }
  return (
    <svg {...c} className="v12m-svg-clock">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="rgba(60,60,67,0.38)" strokeWidth="1.05" />
      <path d="M10 6.5v4l2.8 1.6" fill="none" stroke="rgba(60,60,67,0.55)" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

function TbIcon(props: { name: string }): ReactElement {
  const { name } = props;
  const s = {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "rgba(55, 55, 60, 0.72)",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const
  };
  switch (name) {
    case "chevron-back":
      return (
        <svg {...s}>
          <path d="M12 5l-5 5 5 5" />
        </svg>
      );
    case "chevron-forward":
      return (
        <svg {...s}>
          <path d="M8 5l5 5-5 5" />
        </svg>
      );
    case "chevron-up":
      return (
        <svg {...s}>
          <path d="M5 12l5-5 5 5" />
        </svg>
      );
    case "arrow-clockwise":
      return (
        <svg {...s}>
          <path d="M10 4.5a5.5 5.5 0 014.9 3M15 4v3.5h-3.5M10 15.5a5.5 5.5 0 01-4.9-3M5 16v-3.5h3.5" />
        </svg>
      );
    case "arrow-up-tray":
      return (
        <svg {...s}>
          <path d="M4 14h12M6 10l4-4 4 4M10 6v8" />
        </svg>
      );
    case "arrow-down-tray":
      return (
        <svg {...s}>
          <path d="M4 14h12M6 10l4 4 4-4M10 6v8" />
        </svg>
      );
    case "folder-badge-plus":
      return (
        <svg {...s}>
          <path d="M3.5 6.5h4l1 1h8v9h-13v-10z" />
          <path d="M10 11v4M8 13h4" />
        </svg>
      );
    case "trash":
      return (
        <svg {...s}>
          <path d="M6.5 7.5v9h7v-9M4 7.5h12M8 4.5h4l1 1h3v2h-12v-2h3l1-1z" />
        </svg>
      );
    case "info-circle":
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="6.5" fill="none" />
          <path d="M10 9v5M10 6.8v.1" />
        </svg>
      );
    case "list-bullet":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" aria-hidden>
          <path d="M6 6h9M6 10h9M6 14h9" fill="none" stroke="rgba(55,55,60,0.72)" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="4" cy="6" r="0.85" fill="rgba(55,55,60,0.72)" />
          <circle cx="4" cy="10" r="0.85" fill="rgba(55,55,60,0.72)" />
          <circle cx="4" cy="14" r="0.85" fill="rgba(55,55,60,0.72)" />
        </svg>
      );
    case "rectangle-split":
      return (
        <svg {...s}>
          <rect x="4" y="4" width="12" height="12" rx="1.5" />
          <path d="M10 4.5v11" />
        </svg>
      );
    case "link":
      return (
        <svg {...s}>
          <path d="M8.5 11.5a3 3 0 010-4.2l1-1a3 3 0 114.2 4.2l-1 1M11.5 8.5a3 3 0 010 4.2l-1 1a3 3 0 11-4.2-4.2l1-1" />
        </svg>
      );
    case "plug":
      return (
        <svg {...s}>
          <path d="M6 8h8M7 5v3M13 5v3M8 11v4M12 11v4" />
        </svg>
      );
    default:
      return <svg {...s} />;
  }
}

/** Finder-style path control: recessed track, segment buttons, current cell prominent */
function PathBar(props: { segments: string[]; rootLabel?: string }): ReactElement {
  const { segments, rootLabel } = props;
  const parts = segments[0] === "" ? segments.slice(1) : segments;
  const n = parts.length;
  return (
    <div className="v12m-pathfinder" role="navigation" aria-label="Path">
      <div className="v12m-pathfinder-track">
        {parts.map((seg, i) => {
          const label = i === 0 && rootLabel ? rootLabel : seg;
          const isCurrent = i === n - 1;
          return (
            <span key={`${seg}-${i}`} className="v12m-pathfinder-cell">
              {i > 0 ? (
                <span className="v12m-pathfinder-chev" aria-hidden>
                  ›
                </span>
              ) : null}
              <button type="button" className={`v12m-pathfinder-seg ${isCurrent ? "is-current" : ""}`}>
                {label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LocationStrip(props: {
  title: string;
  meta: string;
  segments: string[];
  pathRootLabel?: string;
  badge?: ReactElement | null;
}): ReactElement {
  return (
    <div className="v12m-loc">
      <div className="v12m-loc-head">
        <div className="v12m-loc-titles">
          <span className="v12m-loc-title">{props.title}</span>
          <span className="v12m-loc-meta">{props.meta}</span>
        </div>
        {props.badge}
      </div>
      <PathBar segments={props.segments} rootLabel={props.pathRootLabel} />
    </div>
  );
}

function FileListBlock(props: {
  rows: MockListRow[];
  selectedId: string;
  paneActive: boolean;
}): ReactElement {
  return (
    <>
      <div className="v12m-list-head">
        <span className="v12m-col-name">Name</span>
        <span>Date modified</span>
        <span>Size</span>
        <span>Kind</span>
      </div>
      <div className="v12m-list" role="list">
        {props.rows.map((row) => {
          const sel = row.id === props.selectedId;
          const selClass = sel ? (props.paneActive ? "sel sel-active" : "sel sel-inactive") : "";
          return (
            <div key={row.id} className={`v12m-lrow ${row.hidden ? "is-hidden" : ""} ${selClass}`} role="listitem">
              <div className="v12m-lname">
                <span className={`v12m-file-ico ${row.kind === "dir" ? "v12m-file-ico--dir" : "v12m-file-ico--file"}`}>
                  <Icon name={row.kind === "dir" ? "folder" : "doc"} size="md" />
                </span>
                <span className="v12m-lname-txt">{row.name}</span>
              </div>
              <span className="v12m-lcell">{row.date}</span>
              <span className="v12m-lcell">{row.size}</span>
              <span className="v12m-lcell v12m-kind">{row.fileKind ?? (row.kind === "dir" ? "Folder" : "Document")}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PaneInspector(props: { scope: "local" | "remote" }): ReactElement {
  if (props.scope === "local") {
    return (
      <aside className="v12m-inspector v12m-inspector--pane" aria-label="Local inspector">
        <div className="v12m-insp-hdr">Info</div>
        <div className="v12m-insp-prev">
          <div className="v12m-insp-iconwrap">
            <Icon name="doc" size="lg" />
          </div>
          <div className="v12m-insp-prev-cap">Markdown</div>
        </div>
        <div className="v12m-insp-block">
          <h2 className="v12m-insp-name">notes.md</h2>
          <p className="v12m-insp-line">4 KB · Modified yesterday, 3:40 PM</p>
        </div>
        <div className="v12m-insp-sect">
          <h3>Details</h3>
          <ul className="v12m-insp-kv">
            <li>
              <span>Where</span>
              <span className="v12m-mono">/Users/demo/Projects/notes.md</span>
            </li>
            <li>
              <span>Permissions</span>
              <span className="v12m-mono">rw-r--r--</span>
            </li>
            <li>
              <span>Owner</span>
              <span>demo</span>
            </li>
            <li>
              <span>Group</span>
              <span>staff</span>
            </li>
          </ul>
        </div>
        <div className="v12m-insp-actions">
          <button type="button" className="v12m-insp-linkbtn">
            Quick Look
          </button>
          <button type="button" className="v12m-insp-linkbtn">
            Reveal in Finder
          </button>
          <button type="button" className="v12m-insp-linkbtn">
            Copy Path
          </button>
        </div>
      </aside>
    );
  }
  return (
    <aside className="v12m-inspector v12m-inspector--pane" aria-label="Remote inspector">
      <div className="v12m-insp-hdr">Info</div>
      <div className="v12m-insp-prev">
        <div className="v12m-insp-iconwrap">
          <Icon name="doc" size="lg" />
        </div>
        <div className="v12m-insp-prev-cap">ZIP archive</div>
      </div>
      <div className="v12m-insp-block">
        <h2 className="v12m-insp-name">release.zip</h2>
        <p className="v12m-insp-line">42 MB · Modified today, 9:50 AM</p>
      </div>
      <div className="v12m-insp-sect">
        <h3>Details</h3>
        <ul className="v12m-insp-kv">
          <li>
            <span>Where</span>
            <span className="v12m-mono">/home/deploy/releases/release.zip</span>
          </li>
          <li>
            <span>Permissions</span>
            <span className="v12m-mono">rw-r--r--</span>
          </li>
          <li>
            <span>Server</span>
            <span>{MOCK_REMOTE_META.host}</span>
          </li>
        </ul>
      </div>
      <div className="v12m-insp-actions">
        <button type="button" className="v12m-insp-linkbtn">
          Quick Look
        </button>
        <button type="button" className="v12m-insp-linkbtn">
          Copy remote path
        </button>
      </div>
    </aside>
  );
}

function PaneEmpty(): ReactElement {
  return (
    <div className="v12m-state-empty">
      <div className="v12m-state-ico">
        <Icon name="folder" />
      </div>
      <p className="v12m-state-title">This folder is empty</p>
      <p className="v12m-state-sub">Items you add appear here.</p>
    </div>
  );
}

function PaneLoading(): ReactElement {
  return (
    <div className="v12m-state-load" aria-busy>
      <div className="v12m-skel" style={{ width: "68%" }} />
      <div className="v12m-skel" style={{ width: "84%" }} />
      <div className="v12m-skel" style={{ width: "58%" }} />
      <div className="v12m-skel" style={{ width: "76%" }} />
    </div>
  );
}

function PaneError(): ReactElement {
  return (
    <div className="v12m-state-err">
      <div className="v12m-err-inline">
        <span className="v12m-err-title">The folder can’t be opened.</span>
        <span className="v12m-err-msg">You don’t have permission to see its contents.</span>
      </div>
    </div>
  );
}

function RemoteDisconnected(): ReactElement {
  return (
    <div className="v12m-state-disc">
      <p className="v12m-state-title">Not connected</p>
      <p className="v12m-state-sub">Connect to browse this site.</p>
      <button type="button" className="v12m-cta">
        Connect
      </button>
    </div>
  );
}

function inspectorVisibleFor(mode: InspectorMode, pane: "local" | "remote", focus: "local" | "remote"): boolean {
  if (mode === "off") return false;
  if (mode === "local") return pane === "local";
  if (mode === "remote") return pane === "remote";
  return focus === pane;
}

export function V12UiMockup(): ReactElement {
  const [localScenario, setLocalScenario] = useState<PaneScenario>("browse");
  const [remoteScenario, setRemoteScenario] = useState<RemoteScenario>("normal");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("local");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusPane, setFocusPane] = useState<"local" | "remote">("local");

  const localTitle = MOCK_BREADCRUMB_LOCAL[MOCK_BREADCRUMB_LOCAL.length - 1] ?? "Local";
  const remoteTitle = MOCK_REMOTE_META.profileName;

  const showLocalInsp = inspectorVisibleFor(inspectorMode, "local", focusPane);
  const showRemoteInsp = inspectorVisibleFor(inspectorMode, "remote", focusPane);

  const localMain = (): ReactElement => {
    if (localScenario === "empty") return <PaneEmpty />;
    if (localScenario === "loading") return <PaneLoading />;
    if (localScenario === "error") return <PaneError />;
    return <FileListBlock rows={MOCK_LIST_LOCAL} selectedId="2" paneActive={focusPane === "local"} />;
  };

  const remoteMain = (): ReactElement => {
    if (remoteScenario === "disconnected") return <RemoteDisconnected />;
    if (remoteScenario === "loading") return <PaneLoading />;
    if (remoteScenario === "error") return <PaneError />;
    return <FileListBlock rows={MOCK_LIST_REMOTE} selectedId="r2" paneActive={focusPane === "remote"} />;
  };

  const remoteBadge =
    remoteScenario === "normal" ? (
      <span className="v12m-badge v12m-badge-ok">
        <span className="v12m-badge-dot" aria-hidden />
        Connected
      </span>
    ) : remoteScenario === "loading" ? (
      <span className="v12m-badge v12m-badge-wait">Connecting…</span>
    ) : remoteScenario === "error" ? (
      <span className="v12m-badge v12m-badge-err">Error</span>
    ) : (
      <span className="v12m-badge v12m-badge-off">Offline</span>
    );

  const running = MOCK_QUEUE.filter((q) => q.state === "running").length;
  const pending = MOCK_QUEUE.filter((q) => q.state === "pending").length;
  const drawerSummary = `${running} running · ${pending} queued`;

  return (
    <div className="v12m-root">
      <div className="v12m-devrail">
        <div className="v12m-devrail-top">
          <span>
            <strong>Mockup</strong> — V1.2 warm Finder-first (static) · dev only · <code>?mockup=v12</code>
          </span>
        </div>
        <div className="v12m-devrail-grid" role="group" aria-label="Mockup state">
          <div className="v12m-devgrp">
            <span className="v12m-devlbl">Local</span>
            {(["browse", "empty", "loading", "error"] as const).map((s) => (
              <button key={s} type="button" className={localScenario === s ? "on" : ""} onClick={() => setLocalScenario(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="v12m-devgrp">
            <span className="v12m-devlbl">Remote</span>
            {(["normal", "disconnected", "loading", "error"] as const).map((s) => (
              <button key={s} type="button" className={remoteScenario === s ? "on" : ""} onClick={() => setRemoteScenario(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="v12m-devgrp">
            <span className="v12m-devlbl">Inspector</span>
            {(["off", "local", "remote", "active"] as const).map((m) => (
              <button key={m} type="button" className={inspectorMode === m ? "on" : ""} onClick={() => setInspectorMode(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="v12m-devgrp">
            <span className="v12m-devlbl">Transfers</span>
            <button type="button" className={drawerOpen ? "on" : ""} onClick={() => setDrawerOpen(true)}>
              shown
            </button>
            <button type="button" className={!drawerOpen ? "on" : ""} onClick={() => setDrawerOpen(false)}>
              hidden
            </button>
          </div>
        </div>
      </div>

      <header className="v12m-titlestrip">
        <div className="v12m-traffic" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <nav className="v12m-titlebar-tabs" aria-label="Tabs">
          {MOCK_WINDOW_TABS.map((t, i) => (
            <button key={t.id} type="button" className={`v12m-ttab ${i === 0 ? "on" : ""}`}>
              {t.title}
            </button>
          ))}
        </nav>
      </header>

      <div className="v12m-core">
        <aside className="v12m-sidebar" aria-label="Sidebar">
          {MOCK_SIDEBAR.map((sec) => (
            <div key={sec.id} className="v12m-ssec">
              <h3>{sec.title}</h3>
              {sec.items.map((it) => (
                <div
                  key={it.id}
                  className={`v12m-srow ${it.id === "f2" ? "on" : ""}`}
                  style={{ "--si": `${(it.indent ?? 0) * 10}px` } as CSSProperties}
                >
                  <Icon name={it.icon} />
                  <span className="v12m-srow-label">{it.label}</span>
                </div>
              ))}
            </div>
          ))}
        </aside>

        <div className="v12m-mainstack">
          <div className="v12m-toolbar">
            <div className="v12m-tg">
              <button type="button" className="v12m-tb" title="Back" aria-label="Back">
                <TbIcon name="chevron-back" />
              </button>
              <button type="button" className="v12m-tb" title="Forward" aria-label="Forward">
                <TbIcon name="chevron-forward" />
              </button>
              <button type="button" className="v12m-tb" title="Enclosing folder" aria-label="Up">
                <TbIcon name="chevron-up" />
              </button>
            </div>
            <span className="v12m-tsep" />
            <div className="v12m-tg">
              <button type="button" className="v12m-tb" title="Refresh" aria-label="Refresh">
                <TbIcon name="arrow-clockwise" />
              </button>
              <button type="button" className="v12m-tb" title="Connect" aria-label="Connect">
                <TbIcon name="plug" />
              </button>
            </div>
            <span className="v12m-tsep" />
            <div className="v12m-tg">
              <button type="button" className="v12m-tb" title="Upload" aria-label="Upload">
                <TbIcon name="arrow-up-tray" />
              </button>
              <button type="button" className="v12m-tb" title="Download" aria-label="Download">
                <TbIcon name="arrow-down-tray" />
              </button>
              <button type="button" className="v12m-tb" title="New folder" aria-label="New folder">
                <TbIcon name="folder-badge-plus" />
              </button>
              <button type="button" className="v12m-tb" title="Delete" aria-label="Delete">
                <TbIcon name="trash" />
              </button>
              <button type="button" className="v12m-tb" title="Get info" aria-label="Get info">
                <TbIcon name="info-circle" />
              </button>
            </div>
            <span className="v12m-tsep" />
            <div className="v12m-tg">
              <button type="button" className="v12m-tb on" title="List" aria-label="List">
                <TbIcon name="list-bullet" />
              </button>
              <button type="button" className="v12m-tb" title="Columns" aria-label="Columns">
                <TbIcon name="rectangle-split" />
              </button>
            </div>
            <input className="v12m-search" placeholder="Search" readOnly aria-label="Search" />
          </div>

          <div className="v12m-split">
            <section
              className={`v12m-pane ${focusPane === "local" ? "is-focus" : "is-blur"}`}
              aria-label="Local"
              onMouseDown={() => setFocusPane("local")}
            >
              <div className="v12m-pane-chrome">
                <LocationStrip title={localTitle} meta="Local" segments={MOCK_BREADCRUMB_LOCAL} badge={null} />
              </div>
              <div className="v12m-pane-body">
                <div className="v12m-pane-split">
                  <div className="v12m-pane-main">{localMain()}</div>
                  {showLocalInsp ? <PaneInspector scope="local" /> : null}
                </div>
              </div>
            </section>

            <section
              className={`v12m-pane ${focusPane === "remote" ? "is-focus" : "is-blur"}`}
              aria-label="Remote"
              onMouseDown={() => setFocusPane("remote")}
            >
              <div className={`v12m-pane-chrome ${remoteScenario === "disconnected" ? "is-muted" : ""}`}>
                <LocationStrip
                  title={remoteTitle}
                  meta={`${MOCK_REMOTE_META.user}@${MOCK_REMOTE_META.host}:${MOCK_REMOTE_META.port}`}
                  segments={MOCK_BREADCRUMB_REMOTE}
                  pathRootLabel="/"
                  badge={remoteBadge}
                />
              </div>
              <div className="v12m-pane-body">
                <div className="v12m-pane-split">
                  <div className="v12m-pane-main">{remoteMain()}</div>
                  {showRemoteInsp ? <PaneInspector scope="remote" /> : null}
                </div>
              </div>
            </section>
          </div>

          <div className={`v12m-drawer ${drawerOpen ? "is-open" : "is-collapsed"}`}>
            <div
              className="v12m-drawer-bar"
              onClick={() => setDrawerOpen((o) => !o)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setDrawerOpen((o) => !o)}
            >
              <span className="v12m-drawer-title">Transfers</span>
              <span className="v12m-drawer-sum">{drawerSummary}</span>
              <span className="v12m-drawer-pill">38%</span>
              <button type="button" className="v12m-drawer-link v12m-drawer-push" onClick={(e) => e.stopPropagation()}>
                Clear completed
              </button>
              <button type="button" className="v12m-drawer-chev" aria-expanded={drawerOpen}>
                {drawerOpen ? "Hide" : "Show"}
              </button>
            </div>
            {drawerOpen ? (
              <div className="v12m-drawer-panel">
                {MOCK_QUEUE.map((q) => (
                  <div key={q.id} className="v12m-qrow">
                    <span className={`v12m-qstate v12m-qstate-${q.state}`}>{q.state}</span>
                    <div className="v12m-qrow-line">
                      <strong>{q.label}</strong>
                      <span className="v12m-qrow-sep">·</span>
                      <span className="v12m-mono v12m-qrow-paths">
                        {q.from} <span className="v12m-qarrow">→</span> {q.to}
                      </span>
                    </div>
                    <div className="v12m-qrow-prog">
                      {q.state === "running" || q.state === "done" ? (
                        <div className="v12m-qprog-mini">
                          <div
                            className={`v12m-qprog-fill ${q.state === "done" ? "is-done" : ""}`}
                            style={{ width: `${Math.round(q.progress * 100)}%` }}
                          />
                        </div>
                      ) : (
                        <span className="v12m-qdash">—</span>
                      )}
                    </div>
                    <span className="v12m-qrow-pct">{q.state === "running" ? `${Math.round(q.progress * 100)}%` : ""}</span>
                    <div className="v12m-qrow-act">
                      {q.state === "failed" ? <button type="button">Retry</button> : null}
                      {q.state === "done" ? <button type="button">Reveal</button> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
