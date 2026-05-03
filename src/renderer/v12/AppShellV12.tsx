import { useState, type ReactElement } from "react";
import "./v12-shell.css";

function TbGlyph(props: { name: "back" | "forward" | "up" | "refresh" | "plug" | "upTray" | "downTray" | "folderPlus" | "trash" | "info" | "list" }): ReactElement {
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
  switch (props.name) {
    case "back":
      return (
        <svg {...s}>
          <path d="M12 5l-5 5 5 5" />
        </svg>
      );
    case "forward":
      return (
        <svg {...s}>
          <path d="M8 5l5 5-5 5" />
        </svg>
      );
    case "up":
      return (
        <svg {...s}>
          <path d="M5 12l5-5 5 5" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...s}>
          <path d="M10 4.5a5.5 5.5 0 014.9 3M15 4v3.5h-3.5M10 15.5a5.5 5.5 0 01-4.9-3M5 16v-3.5h3.5" />
        </svg>
      );
    case "plug":
      return (
        <svg {...s}>
          <path d="M6 8h8M7 5v3M13 5v3M8 11v4M12 11v4" />
        </svg>
      );
    case "upTray":
      return (
        <svg {...s}>
          <path d="M4 14h12M6 10l4-4 4 4M10 6v8" />
        </svg>
      );
    case "downTray":
      return (
        <svg {...s}>
          <path d="M4 14h12M6 10l4 4 4-4M10 6v8" />
        </svg>
      );
    case "folderPlus":
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
    case "info":
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M10 9v5M10 6.8v.1" />
        </svg>
      );
    case "list":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" aria-hidden>
          <path d="M6 6h9M6 10h9M6 14h9" fill="none" stroke="rgba(55,55,60,0.72)" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="4" cy="6" r="0.85" fill="rgba(55,55,60,0.72)" />
          <circle cx="4" cy="10" r="0.85" fill="rgba(55,55,60,0.72)" />
          <circle cx="4" cy="14" r="0.85" fill="rgba(55,55,60,0.72)" />
        </svg>
      );
    default:
      return <span style={{ width: 18, height: 18 }} />;
  }
}

/**
 * V1.2 Finder-first app shell (M1). No business logic — placeholders until M2+.
 */
export function AppShellV12(): ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="cfv12-root">
      <header className="cfv12-titlestrip" aria-label="Window title and tabs">
        <div className="cfv12-traffic" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <nav className="cfv12-tabs" aria-label="Session tabs">
          <button type="button" className="cfv12-tab is-active">
            Session 1
          </button>
          <button type="button" className="cfv12-tab">
            Session 2
          </button>
        </nav>
      </header>

      <div className="cfv12-core">
        <aside className="cfv12-sidebar" aria-label="Sidebar">
          <div className="cfv12-ssec">
            <h2>Locations</h2>
            <div className="cfv12-srow">Macintosh HD</div>
            <div className="cfv12-srow">Network</div>
          </div>
          <div className="cfv12-ssec">
            <h2>Favorites</h2>
            <div className="cfv12-srow is-active">Projects</div>
            <div className="cfv12-srow">Downloads</div>
          </div>
          <div className="cfv12-ssec">
            <h2>Connections</h2>
            <div className="cfv12-srow">Staging</div>
          </div>
        </aside>

        <div className="cfv12-main">
          <div className="cfv12-banner">
            V1.2 shell (Milestone 1). Remove <code>?ui=v12</code> from the URL to return to the classic CoFinder UI. Toolbar actions are visual only until M5.
          </div>

          <div className="cfv12-toolbar" role="toolbar" aria-label="Main toolbar">
            <button type="button" className="cfv12-tb" title="Back" aria-label="Back" disabled>
              <TbGlyph name="back" />
            </button>
            <button type="button" className="cfv12-tb" title="Forward" aria-label="Forward" disabled>
              <TbGlyph name="forward" />
            </button>
            <button type="button" className="cfv12-tb" title="Enclosing folder" aria-label="Up" disabled>
              <TbGlyph name="up" />
            </button>
            <span className="cfv12-tsep" aria-hidden />
            <button type="button" className="cfv12-tb" title="Refresh" aria-label="Refresh" disabled>
              <TbGlyph name="refresh" />
            </button>
            <button type="button" className="cfv12-tb" title="Connect" aria-label="Connect" disabled>
              <TbGlyph name="plug" />
            </button>
            <span className="cfv12-tsep" aria-hidden />
            <button type="button" className="cfv12-tb" title="Upload" aria-label="Upload" disabled>
              <TbGlyph name="upTray" />
            </button>
            <button type="button" className="cfv12-tb" title="Download" aria-label="Download" disabled>
              <TbGlyph name="downTray" />
            </button>
            <button type="button" className="cfv12-tb" title="New folder" aria-label="New folder" disabled>
              <TbGlyph name="folderPlus" />
            </button>
            <button type="button" className="cfv12-tb" title="Delete" aria-label="Delete" disabled>
              <TbGlyph name="trash" />
            </button>
            <button type="button" className="cfv12-tb" title="Get Info" aria-label="Get Info" disabled>
              <TbGlyph name="info" />
            </button>
            <span className="cfv12-tsep" aria-hidden />
            <button type="button" className="cfv12-tb" title="List" aria-label="List" disabled>
              <TbGlyph name="list" />
            </button>
            <input className="cfv12-search" placeholder="Search" readOnly aria-label="Search" />
          </div>

          <div className="cfv12-split" aria-label="Dual pane workspace">
            <section className="cfv12-pane" aria-label="Local pane">
              <div className="cfv12-pane-hd">Local</div>
              <div className="cfv12-pane-body">
                <div>
                  <strong>Local workspace</strong>
                  Real file list and navigation will mount here in <strong>M2</strong>.
                </div>
              </div>
            </section>
            <section className="cfv12-pane" aria-label="Remote pane">
              <div className="cfv12-pane-hd">Remote</div>
              <div className="cfv12-pane-body">
                <div>
                  <strong>Remote workspace</strong>
                  Connected browse and embedded connect flow will mount in <strong>M2–M4</strong>.
                </div>
              </div>
            </section>
          </div>

          <div className="cfv12-drawer">
            <div
              className="cfv12-drawer-bar"
              onClick={() => setDrawerOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDrawerOpen((o) => !o);
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={drawerOpen}
            >
              <span className="cfv12-drawer-title">Transfers</span>
              <span className="cfv12-drawer-hint">Queue UI shells here in M5 · placeholder summary</span>
              <button
                type="button"
                className="cfv12-drawer-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerOpen((o) => !o);
                }}
              >
                {drawerOpen ? "Hide" : "Show"}
              </button>
            </div>
            {drawerOpen ? (
              <div className="cfv12-drawer-panel">
                Transfer list and live progress will connect to the existing queue in Milestone 5.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
