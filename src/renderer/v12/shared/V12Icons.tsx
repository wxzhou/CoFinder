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
    case "chevron-down":
      return (
        <svg {...s}>
          <path d="M5 8l5 5 5-5" />
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
          <path d="
M3.7 9.7
L10 3.6
L16.3 9.7
H13.7
V15.7
H11.2
V11.5
H8.8
V15.7
H6.3
V9.7
H3.7
Z
"/>
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
          <path d="M10 13V5.9" />
          <path d="M6.9 9L10 5.9 13.1 9" />
          <path d="M4.9 13.5v1.8c0 .45.36.8.8.8h8.6c.44 0 .8-.35.8-.8v-1.8" />
        </svg>
      );
    case "arrow-down-tray":
      return (
        <svg {...s}>
          <path d="M10 5.4v7.6" />
          <path d="M6.9 9.9L10 13l3.1-3.1" />
          <path d="M4.9 13.5v1.8c0 .45.36.8.8.8h8.6c.44 0 .8-.35.8-.8v-1.8" />
        </svg>
      );
    case "copy":
      return (
        <svg {...s}>
          <rect x="7" y="5" width="8" height="10" rx="1" />
          <path d="M5 13.5H4.5a1 1 0 01-1-1v-8a1 1 0 011-1H11a1 1 0 011 1V5" />
        </svg>
      );
    case "copy-path":
      return (
        <svg {...s}>
          <rect x="7" y="5" width="8" height="10" rx="1" />
          <path d="M5 13.5H4.5a1 1 0 01-1-1v-8a1 1 0 011-1H11a1 1 0 011 1V5" />
          <path d="M8.8 12.2h4.4" />
        </svg>
      );
    case "open-file":
      return (
        <svg {...s}>
          <path d="M5 3.8h6.2L15 7.6v8.6H5V3.8z" />
          <path d="M11.2 3.8v3.8H15" />
          <path d="M8 12.5h5M10.5 10l2.5 2.5-2.5 2.5" />
        </svg>
      );
    case "eye":
      return (
        <svg {...s}>
          <path d="M3.6 10s2.35-4.2 6.4-4.2 6.4 4.2 6.4 4.2-2.35 4.2-6.4 4.2S3.6 10 3.6 10z" />
          <circle cx="10" cy="10" r="1.85" />
        </svg>
      );
    case "rename":
      return (
        <svg {...s}>
          <path d="M6 5.2h8M10 5.2v9.6M6 14.8h8" />
          <path d="M4.4 7.2V5.6c0-.8.6-1.4 1.4-1.4h1.4M15.6 12.8v1.6c0 .8-.6 1.4-1.4 1.4h-1.4" />
        </svg>
      );
    case "batch-rename":
      return (
        <svg {...s}>
          <path d="M4 6h7M4 10h7M4 14h5" />
          <path d="M13 5.5h3M14.5 4v3M13 12.5l3-3 1.5 1.5-3 3-2 .5.5-2z" />
        </svg>
      );
    case "copy-to":
      return (
        <svg {...s}>
          <rect x="4" y="5" width="7" height="9" rx="1" />
          <path d="M8 15h6a1 1 0 001-1V7" />
          <path d="M12 7h4M14 5l2 2-2 2" />
        </svg>
      );
    case "move-to":
      return (
        <svg {...s}>
          <rect x="3.8" y="5" width="6.8" height="9" rx="1" />
          <path d="M12 7h4.2M14.2 5l2 2-2 2M10.6 13h5.6M14.2 11l2 2-2 2" />
        </svg>
      );
    case "folder-badge-plus":
      return (
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.35}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2.95 8.5c0-.78.63-1.4 1.4-1.4h3.55c.38 0 .74.15 1 .42l1.03 1.05h8.05c.78 0 1.4.63 1.4 1.4v6.55c0 .78-.63 1.4-1.4 1.4H4.35c-.78 0-1.4-.63-1.4-1.4V8.5z" />
          <path d="M4.65 10.05h9.8" />
          <circle cx="17.45" cy="7.2" r="3.55" fill="currentColor" stroke="none" />
          <path d="M17.45 5.35v3.7M15.6 7.2h3.7" stroke="#fff" strokeWidth={1.2} />
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
    case "finder":
      return (
        <svg {...s}>
          <rect x="4.2" y="4.2" width="11.6" height="11.6" rx="2" />
          <path d="M10 4.6v10.8M6.8 8.2h.1M13.2 8.2h.1M7 12.3c1.9 1 4.1 1 6 0" />
        </svg>
      );
    case "trash":
      return (
        <svg {...s}>
          <path d="
          M6 5.6
          h8
          l0 9.85
          c-.04 .61 -.55 1.1 -1.16 1.1
          H7.16
          c-.61 0 -1.12 -.49 -1.16 -1.1
          L6 5.6
          z" />
          <path d="M4.7 5.6h10.6" />
          <path d="
          M8.9 5.6
          l.35-1.5
          h1.5
          l.35 1.5" />
          <path d="M8 7.9v6M10 7.9v6M12 7.9v6" />
        </svg>
      );
    case "info-circle":
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="6.5" fill="none" />
          <path d="M10 9v5M10 6.8v.1" />
        </svg>
      );
    case "file-operation":
      return (
        <svg {...s}>
          <path d="M5 4h6l3.5 3.5V16H5V4z" />
          <path d="M11 4v3.5h3.5" />
          <path d="M7.2 12.7l1.4 1.4 3.7-4.2" />
        </svg>
      );
    case "touch":
      return (
        <svg {...s}>
          <path d="M8.2 8.2V5.3a1.2 1.2 0 012.4 0v6.1" />
          <path d="M10.6 8.1a1.15 1.15 0 012.3.15v3.3" />
          <path d="M12.9 8.9a1.12 1.12 0 012.24.16v3.6" />
          <path d="M8.2 11.2l-1.1-1a1.12 1.12 0 00-1.55 1.62l3.25 3.2c.72.7 1.6 1.05 2.6 1.05h1.2c1.85 0 3.35-1.5 3.35-3.35" />
        </svg>
      );
    case "archive":
      return (
        <svg {...s}>
          <rect x="4" y="5" width="9.5" height="3.2" rx="0.8" />
          <rect x="5.2" y="8.4" width="9.5" height="3.2" rx="0.8" />
          <rect x="4" y="11.8" width="9.5" height="3.2" rx="0.8" />
          <path d="M14.6 7.4l2.4 2.4-2.4 2.4M17 9.8h-4" />
        </svg>
      );
    case "decompress":
      return (
        <svg {...s}>
          <rect x="6.5" y="5" width="9.5" height="3.2" rx="0.8" />
          <rect x="5.3" y="8.4" width="9.5" height="3.2" rx="0.8" />
          <rect x="6.5" y="11.8" width="9.5" height="3.2" rx="0.8" />
          <path d="M5.4 7.4L3 9.8l2.4 2.4M3 9.8h4" />
        </svg>
      );
    case "search":
      return (
        <svg {...s}>
          <circle cx="8.8" cy="8.8" r="4.2" />
          <path d="M12 12l4 4" />
        </svg>
      );
    case "text-lines":
      return (
        <svg {...s}>
          <path d="M5 5.5h10M5 8.7h10M5 11.9h7M5 15.1h9" />
        </svg>
      );
    case "hash":
      return (
        <svg {...s}>
          <path d="M8.2 4.5l-1 11M13.2 4.5l-1 11M5 8h11M4.5 12h11" />
        </svg>
      );
    case "lock":
      return (
        <svg {...s}>
          <rect x="4.5" y="8.5" width="11" height="7.5" rx="1.5" />
          <path d="M7.2 8.5V6.8a2.8 2.8 0 015.6 0v1.7M10 11.2v2" />
        </svg>
      );
    case "duplicate":
      return (
        <svg {...s}>
          <path d="M7 5h6l2.5 2.5V15H7V5z" />
          <path d="M13 5v2.5h2.5" />
          <path d="M5 13H4.5a1 1 0 01-1-1V4.8a1 1 0 011-1H11" />
        </svg>
      );
    case "list-bullet":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" aria-hidden>
          <path d="M7.2 5.2h8.2M7.2 10h8.2M7.2 14.8h8.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="4.2" cy="5.2" r="1.05" fill="currentColor" />
          <circle cx="4.2" cy="10" r="1.05" fill="currentColor" />
          <circle cx="4.2" cy="14.8" r="1.05" fill="currentColor" />
        </svg>
      );
    case "grid-2x2":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3.2" y="3.2" width="5.2" height="5.2" rx="1.35" />
          <rect x="11.6" y="3.2" width="5.2" height="5.2" rx="1.35" />
          <rect x="3.2" y="11.6" width="5.2" height="5.2" rx="1.35" />
          <rect x="11.6" y="11.6" width="5.2" height="5.2" rx="1.35" />
        </svg>
      );
    case "columns-3":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3.4" width="4.2" height="13.2" rx="1.05" />
          <rect x="7.9" y="3.4" width="4.2" height="13.2" rx="1.05" />
          <rect x="12.8" y="3.4" width="4.2" height="13.2" rx="1.05" />
        </svg>
      );
    case "gallery":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3.2" width="14" height="9.3" rx="1.8" />
          <path d="M4.4 16h.2M7.2 16h.2M10 16h.2M12.8 16h.2M15.6 16h.2" strokeWidth={2.45} />
        </svg>
      );
    case "group-by-type":
      return (
        <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3.2" y="3.2" width="4.4" height="4.1" rx="0.8" />
          <rect x="10.4" y="3.2" width="6.4" height="4.1" rx="0.8" />
          <rect x="3.2" y="10.4" width="4.4" height="6.4" rx="0.8" />
          <rect x="10.4" y="10.4" width="6.4" height="6.4" rx="0.8" />
          <path d="M3.2 8.7h13.6" strokeWidth={1.15} opacity={0.9} />
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
          <path d="M3.6 10s2.35-4.2 6.4-4.2 6.4 4.2 6.4 4.2-2.35 4.2-6.4 4.2S3.6 10 3.6 10z" />
          <circle cx="10" cy="10" r="1.85" />
        </svg>
      );
    case "sidebar-toggle":
      return (
        <svg
          width={25}
          height={21}
          viewBox="0 0 28 22"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.65}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="3.5" width="22" height="15" rx="2.8" />
          <path d="M9.15 3.9v14.2" />
          <path d="M5.95 7.35h1.05M5.95 9.85h1.05M5.95 12.35h1.05" />
        </svg>
      );
    case "gear":
      return (
        <svg {...s}>
          <circle cx="10" cy="10" r="2.4" />
          <path d="M10 3.8v2M10 14.2v2M4.6 6.9l1.7 1M13.7 12.1l1.7 1M4.6 13.1l1.7-1M13.7 7.9l1.7-1" />
        </svg>
      );
    case "gear-preferences":
      return (
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.38a2 2 0 00-.73-2.73l-.15-.09a2 2 0 01-1-1.74v-.51a2 2 0 011-1.72l.15-.1a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
          <circle cx="12" cy="12" r="3" />
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
