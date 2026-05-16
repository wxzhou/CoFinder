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
    width: 28,
    height: 28,
    viewBox: "0 0 28 28",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.05,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const
  };
  const compact = {
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
          <path d="M17.5 5.5 9 14l8.5 8.5" />
        </svg>
      );
    case "chevron-forward":
      return (
        <svg {...s}>
          <path d="m10.5 5.5 8.5 8.5-8.5 8.5" />
        </svg>
      );
    case "chevron-up":
      return (
        <svg {...s}>
          <path d="m5.5 17.5 8.5-8.5 8.5 8.5" />
        </svg>
      );
    case "sort-asc":
      return (
        <svg {...compact}>
          <path d="M6 12l4-4 4 4" />
        </svg>
      );
    case "sort-desc":
      return (
        <svg {...compact}>
          <path d="M6 8l4 4 4-4" />
        </svg>
      );
    case "xmark":
      return (
        <svg {...compact}>
          <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" />
        </svg>
      );
    case "plus":
      return (
        <svg {...compact}>
          <path d="M10 5v10M5 10h10" />
        </svg>
      );
    case "check":
      return (
        <svg {...compact}>
          <path d="M5 10.5l3 3 7-7" />
        </svg>
      );
    case "home":
      return (
        <svg {...s}>
          <path d="M5 13.2 14 5l9 8.2" />
          <path d="M7.7 11.8v10.4h12.6V11.8" />
        </svg>
      );
    case "arrow-clockwise":
      return (
        <svg {...s}>
          <path d="M8.1 8.2A8.1 8.1 0 0 1 21.7 11" />
          <path d="M21.8 5.5V11h-5.5" />
          <path d="M19.9 19.8A8.1 8.1 0 0 1 6.3 17" />
          <path d="M6.2 22.5V17h5.5" />
        </svg>
      );
    case "arrow-up-tray":
      return (
        <svg {...s}>
          <path d="M14 22V6.5" />
          <path d="m7.8 12.7 6.2-6.2 6.2 6.2" />
          <path d="M5.5 22.2h17" />
        </svg>
      );
    case "arrow-down-tray":
      return (
        <svg {...s}>
          <path d="M14 6v15.5" />
          <path d="m7.8 15.3 6.2 6.2 6.2-6.2" />
          <path d="M5.5 5.8h17" />
        </svg>
      );
    case "copy":
      return (
        <svg {...s}>
          <g transform="translate(.7 .9) scale(1.55)">
            <rect x="7" y="5" width="8" height="10" rx="1" vectorEffect="non-scaling-stroke" />
            <path d="M5 13.5H4.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H11a1 1 0 0 1 1 1V5" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
      );
    case "folder-badge-plus":
      return (
        <svg {...s}>
          <path d="M4.2 9.5c0-.9.7-1.6 1.6-1.6h4.6l2.1 2.1h9.7c.9 0 1.6.7 1.6 1.6v8.6c0 .9-.7 1.6-1.6 1.6H5.8c-.9 0-1.6-.7-1.6-1.6z" />
          <path d="M17.8 13.4v6.2" />
          <path d="M14.7 16.5h6.2" />
        </svg>
      );
    case "doc-badge-plus":
      return (
        <svg {...s}>
          <path d="M7 5.6C7 4.7 7.7 4 8.6 4h7.1L21 9.3v13.1c0 .9-.7 1.6-1.6 1.6H8.6c-.9 0-1.6-.7-1.6-1.6z" />
          <path d="M15.1 4v5.9c0 .8.6 1.4 1.4 1.4H21" />
          <path d="M14 13.8v6.4" />
          <path d="M10.8 17h6.4" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...s}>
          <g transform="translate(-1.2 -1) scale(1.22)">
            <path d="M5.5 17.7 6.4 14l7.9-7.9 3.6 3.6-7.9 7.9-3.7.9a.7.7 0 0 1-.8-.8z" />
            <path d="M16.9 3.5a1.9 1.9 0 0 1 2.7 0l.9.9a1.9 1.9 0 0 1 0 2.7l-.8.8-3.6-3.6.8-.8z" />
          </g>
        </svg>
      );
    case "trash":
      return (
        <svg {...s}>
          <path d="M7.2 8.4h13.6" />
          <path d="M10.1 8.4V5.2h7.8v3.2" />
          <path d="m9.1 11.2.8 12h8.2l.8-12" />
          <path d="M12.4 13.8v6.5" />
          <path d="M15.6 13.8v6.5" />
        </svg>
      );
    case "info-circle":
      return (
        <svg {...compact}>
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
          <circle cx="14" cy="14" r="9.1" />
          <path d="M14 8v6.3l4.3 2.6" />
        </svg>
      );
    case "history":
      return (
        <svg {...s}>
          <path d="M7.2 8.4H4.1V5.3" />
          <path d="M4.6 8a9 9 0 1 1 1.5 12.2" />
          <path d="M14 9v5.2l3.6 2.2" />
        </svg>
      );
    case "clear-clock":
      return (
        <svg {...s}>
          <circle cx="12.3" cy="12.2" r="7.2" />
          <path d="M12.3 7.7v5.1l3 1.8" />
          <path d="m18.6 18.2 4.2 4.2" />
          <path d="m22.8 18.2-4.2 4.2" />
        </svg>
      );
    case "rectangle-split":
      return (
        <svg {...compact}>
          <rect x="4" y="4" width="12" height="12" rx="1.5" />
          <path d="M10 4.5v11" />
        </svg>
      );
    case "plug":
      return (
        <svg {...compact}>
          <path d="M6 8h8M7 5v3M13 5v3M8 11v4M12 11v4" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...s}>
          <rect x="4.5" y="5.5" width="19" height="17" rx="2.8" />
          <path d="m8.5 10.6 3.5 3.4-3.5 3.4" />
          <path d="M14.4 17.4h5.2" />
        </svg>
      );
    case "sidebar-right":
      return (
        <svg {...s}>
          <path d="M5.5 5.5v17" />
          <rect x="10" y="5.5" width="12.5" height="17" rx="2.7" />
        </svg>
      );
    case "gear":
      return (
        <svg {...compact}>
          <circle cx="10" cy="10" r="2.4" />
          <path d="M10 3.8v2M10 14.2v2M4.6 6.9l1.7 1M13.7 12.1l1.7 1M4.6 13.1l1.7-1M13.7 7.9l1.7-1" />
        </svg>
      );
    default:
      return <svg {...compact} />;
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
