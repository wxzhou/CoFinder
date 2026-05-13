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

export function V12TbIcon(props: { name: string }): ReactElement {
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
    case "plug":
      return (
        <svg {...s}>
          <path d="M6 8h8M7 5v3M13 5v3M8 11v4M12 11v4" />
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
