import type { CSSProperties, ReactElement } from "react";

/** Icons copied from `V12UiMockup` — single visual source for mockup + production v12. */
export function V12Icon(props: { name: "disk" | "folder" | "server" | "clock" | "doc"; size?: "sm" | "md" | "lg" }): ReactElement {
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
        <defs>
          <linearGradient id="v12-doc-page" x1="3.5" x2="15.5" y1="3" y2="17.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="58%" stopColor="#f7f7f6" />
            <stop offset="100%" stopColor="#ecebea" />
          </linearGradient>
          <linearGradient id="v12-doc-fold" x1="11" x2="15" y1="3.5" y2="7.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ececea" />
          </linearGradient>
          <filter id="v12-doc-shadow" x="-20%" y="-10%" width="140%" height="135%">
            <feDropShadow dx="0" dy="0.7" stdDeviation="0.6" floodColor="rgba(0,0,0,0.2)" />
          </filter>
        </defs>
        <path
          d="M5.25 3.35h5.95c.34 0 .66.13.9.37l2.18 2.18c.24.24.37.56.37.9v8.95c0 .69-.56 1.25-1.25 1.25H5.25C4.56 17 4 16.44 4 15.75V4.6c0-.69.56-1.25 1.25-1.25z"
          fill="url(#v12-doc-page)"
          stroke="rgba(60,60,67,0.42)"
          strokeWidth="1.1"
          strokeLinejoin="round"
          filter="url(#v12-doc-shadow)"
        />
        <path
          d="M11.35 3.55v2.6c0 .5.4.9.9.9h2.2c-.05-.43-.2-.82-.5-1.12l-2.27-2.28a1.55 1.55 0 00-1.13-.5z"
          fill="url(#v12-doc-fold)"
          stroke="rgba(60,60,67,0.18)"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.72 6.8c.85.42 1.78.54 2.72.25"
          fill="none"
          stroke="rgba(60,60,67,0.16)"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "folder") {
    return (
      <svg {...c} className="v12m-svg-folder">
        <defs>
          <linearGradient id="v12-folder-tab" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#9fd0ff" />
            <stop offset="100%" stopColor="#6eb4f3" />
          </linearGradient>
          <linearGradient id="v12-folder-body" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#87c7ff" />
            <stop offset="100%" stopColor="#4ea3ec" />
          </linearGradient>
        </defs>
        <path
          d="M3.25 5.15c0-.57.46-1.03 1.03-1.03h2.35c.28 0 .55.11.75.31l.72.72h7.62c.57 0 1.03.46 1.03 1.03v7.52c0 .57-.46 1.03-1.03 1.03H4.28c-.57 0-1.03-.46-1.03-1.03V5.15z"
          fill="url(#v12-folder-tab)"
        />
        <path
          d="M2.9 7.1c0-.56.45-1.01 1.01-1.01h12.18c.56 0 1.01.45 1.01 1.01v7.25c0 .84-.68 1.53-1.53 1.53H4.43c-.84 0-1.53-.68-1.53-1.53V7.1z"
          fill="url(#v12-folder-body)"
        />
        <path d="M3.25 7.1h13.5" stroke="rgba(255,255,255,0.42)" strokeWidth="0.7" />
        <path d="M4.2 15.3h11.6" stroke="rgba(38,116,190,0.26)" strokeWidth="0.7" strokeLinecap="round" />
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

export function V12TbIcon(props: { name: string }): ReactElement {
  const { name } = props;
  const s = {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
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
    case "sort-asc":
      return (
        <svg {...s}>
          <path d="M6 12l4-4 4 4" />
        </svg>
      );
    case "sort-desc":
      return (
        <svg {...s}>
          <path d="M6 8l4 4 4-4" />
        </svg>
      );
    case "xmark":
      return (
        <svg {...s}>
          <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" />
        </svg>
      );
    case "plus":
      return (
        <svg {...s}>
          <path d="M10 5v10M5 10h10" />
        </svg>
      );
    case "check":
      return (
        <svg {...s}>
          <path d="M5 10.5l3 3 7-7" />
        </svg>
      );
    case "home":
      return (
        <svg {...s}>
          <path d="M4 9.5l6-5 6 5" />
          <path d="M6 8.5v7h8v-7" />
        </svg>
      );
    case "arrow-clockwise":
      return (
        <svg {...s}>
          <path d="M8.5 4.8A5.5 5.5 0 0114.9 7.5M15 4v3.5h-3.5M11.5 15.2a5.5 5.5 0 01-6.4-2.7M5 16v-3.5h3.5" />
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
    case "copy":
      return (
        <svg {...s}>
          <rect x="7" y="5" width="8" height="10" rx="1" />
          <path d="M5 13.5H4.5a1 1 0 01-1-1v-8a1 1 0 011-1H11a1 1 0 011 1V5" />
        </svg>
      );
    case "folder-badge-plus":
      return (
        <svg {...s}>
          <path d="M3.5 6.5h4l1 1h8v9h-13v-10z" />
          <path d="M10 11v4M8 13h4" />
        </svg>
      );
    case "doc-badge-plus":
      return (
        <svg {...s}>
          <path d="M5 3.5h6.5L15 7v9.5H5v-13z" />
          <path d="M11.5 3.5V7H15M10 10.5v4M8 12.5h4" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...s}>
          <path d="M8.5 5.5h-2.7a1.3 1.3 0 00-1.3 1.3v7.4c0 .72.58 1.3 1.3 1.3h7.4c.72 0 1.3-.58 1.3-1.3v-2.7" />
          <path d="M10.2 11.2l-2.7.8.8-2.7 5.6-5.6a1.2 1.2 0 011.7 1.7l-5.4 5.8z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...s}>
          <path d="M6.7 7.4l.5 8.2c.04.64.57 1.15 1.21 1.15h3.18c.64 0 1.17-.51 1.21-1.15l.5-8.2" />
          <path d="M5 7.4h10" />
          <path d="M8.2 5.7h3.6M9 4.2h2l.45 1.5h-2.9L9 4.2z" />
          <path d="M9 9.4v4.7M11 9.4v4.7" />
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
          <path d="M6 6h9M6 10h9M6 14h9" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="4" cy="6" r="0.85" fill="currentColor" />
          <circle cx="4" cy="10" r="0.85" fill="currentColor" />
          <circle cx="4" cy="14" r="0.85" fill="currentColor" />
        </svg>
      );
    case "clock":
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M10 6.5v4l2.6 1.5" />
        </svg>
      );
    case "history":
      return (
        <svg {...s}>
          <path d="M5.5 7.2H3.4V5.1" />
          <path d="M4 7a6.5 6.5 0 111.6 6.6" />
          <path d="M10 6.5v4l2.5 1.5" />
        </svg>
      );
    case "clear-clock":
      return (
        <svg {...s}>
          <circle cx="9" cy="9" r="5.4" />
          <path d="M9 6v3.2l2 1.2M13.8 13.8l2.7 2.7M16.5 13.8l-2.7 2.7" />
        </svg>
      );
    case "rectangle-split":
      return (
        <svg {...s}>
          <rect x="4" y="4" width="12" height="12" rx="1.5" />
          <path d="M10 4.5v11" />
        </svg>
      );
    case "plug":
      return (
        <svg {...s}>
          <path d="M6 8h8M7 5v3M13 5v3M8 11v4M12 11v4" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...s}>
          <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" />
          <path d="M6.5 8l2 2-2 2M10 12h3.5" />
        </svg>
      );
    case "sidebar-right":
      return (
        <svg {...s}>
          <rect x="4" y="4" width="7" height="12" rx="1" />
          <path d="M13 4.5v11" />
        </svg>
      );
    case "gear":
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="2.4" />
          <path d="M10 3.8v2M10 14.2v2M4.6 6.9l1.7 1M13.7 12.1l1.7 1M4.6 13.1l1.7-1M13.7 7.9l1.7-1" />
        </svg>
      );
    default:
      return <svg {...s} />;
  }
}

export type V12SidebarIcon = "disk" | "folder" | "server" | "clock";

/** Fallback scaffold when `AppShellV12` gets no `sidebar` prop. Production v12 passes `V12LocalFavoritesSidebar` from `App.tsx`. */
export function V12DefaultSidebar(): ReactElement {
  const style = (indent: number): CSSProperties => ({ "--si": `${indent * 10}px` } as CSSProperties);
  return (
    <aside className="v12m-sidebar" aria-label="Sidebar">
      <div className="v12m-ssec">
        <h3>Locations</h3>
        <div className="v12m-srow" style={style(0)}>
          <V12Icon name="disk" />
          <span className="v12m-srow-label">Macintosh HD</span>
        </div>
        <div className="v12m-srow" style={style(0)}>
          <V12Icon name="disk" />
          <span className="v12m-srow-label">Network</span>
        </div>
      </div>
      <div className="v12m-ssec">
        <h3>Favorites</h3>
        <div className="v12m-srow on" style={style(0)}>
          <V12Icon name="folder" />
          <span className="v12m-srow-label">Projects</span>
        </div>
        <div className="v12m-srow" style={style(0)}>
          <V12Icon name="folder" />
          <span className="v12m-srow-label">Downloads</span>
        </div>
      </div>
      <div className="v12m-ssec">
        <h3>Connections</h3>
        <div className="v12m-srow" style={style(0)}>
          <V12Icon name="server" />
          <span className="v12m-srow-label">Staging</span>
        </div>
      </div>
    </aside>
  );
}
