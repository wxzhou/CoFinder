/** V1.2 mockup — fake data only. */

export const MOCK_WINDOW_TABS = [
  { id: "w1", title: "Build server" },
  { id: "w2", title: "Home iMac" }
];

export type SidebarIcon = "disk" | "folder" | "server" | "clock";

export type SidebarSection = {
  id: string;
  title: string;
  items: { id: string; label: string; icon: SidebarIcon; indent?: number }[];
};

export const MOCK_SIDEBAR: SidebarSection[] = [
  {
    id: "locations",
    title: "Locations",
    items: [
      { id: "d1", label: "Macintosh HD", icon: "disk", indent: 0 },
      { id: "d2", label: "Backup NVMe", icon: "disk", indent: 0 }
    ]
  },
  {
    id: "favorites",
    title: "Favorites",
    items: [
      { id: "f1", label: "Downloads", icon: "folder", indent: 0 },
      { id: "f2", label: "Projects", icon: "folder", indent: 0 },
      { id: "f3", label: "Screens & captures", icon: "folder", indent: 0 }
    ]
  },
  {
    id: "connections",
    title: "Connections",
    items: [
      { id: "c1", label: "Staging", icon: "server", indent: 0 },
      { id: "c2", label: "logs.internal", icon: "server", indent: 0 }
    ]
  },
  {
    id: "recents",
    title: "Recents",
    items: [
      { id: "r1", label: "release.zip", icon: "clock", indent: 0 },
      { id: "r2", label: "build.tar.gz", icon: "clock", indent: 0 }
    ]
  }
];

export const MOCK_BREADCRUMB_LOCAL = ["Macintosh HD", "Users", "demo", "Projects"];
export const MOCK_BREADCRUMB_REMOTE = ["", "home", "deploy", "releases"];

export type MockListRow = {
  id: string;
  name: string;
  date: string;
  size: string;
  kind: "dir" | "file";
  fileKind?: string;
  hidden?: boolean;
};

export const MOCK_LIST_LOCAL: MockListRow[] = [
  { id: "0", name: ".env.local", date: "May 1, 2026 at 09:12", size: "312 B", kind: "file", fileKind: "Document", hidden: true },
  { id: "1", name: "build", date: "Today, 10:02", size: "—", kind: "dir", fileKind: "Folder" },
  {
    id: "2",
    name: "notes.md",
    date: "Yesterday, 15:40",
    size: "4 KB",
    kind: "file",
    fileKind: "Markdown"
  },
  {
    id: "3",
    name: "very-long-filename-for-ui-truncation-test.png",
    date: "Apr 18, 2026",
    size: "820 KB",
    kind: "file",
    fileKind: "PNG image"
  }
];

export const MOCK_LIST_REMOTE: MockListRow[] = [
  { id: "r0", name: ".well-known", date: "Mar 2, 2026", size: "—", kind: "dir", fileKind: "Folder", hidden: true },
  { id: "r1", name: "v2.3.1", date: "Today, 09:55", size: "—", kind: "dir", fileKind: "Folder" },
  { id: "r2", name: "release.zip", date: "Today, 09:50", size: "42 MB", kind: "file", fileKind: "ZIP archive" }
];

export type MockQueueItem = {
  id: string;
  state: "running" | "pending" | "failed" | "done";
  label: string;
  from: string;
  to: string;
  progress: number;
};

export const MOCK_QUEUE: MockQueueItem[] = [
  {
    id: "q1",
    state: "running",
    label: "Upload folder",
    from: "~/Projects/build",
    to: "/var/www/html",
    progress: 0.38
  },
  {
    id: "q2",
    state: "pending",
    label: "Download release.zip",
    from: "/home/deploy/releases",
    to: "~/Downloads",
    progress: 0
  },
  {
    id: "q3",
    state: "done",
    label: "Sync config",
    from: "~/Sites/staging",
    to: "/etc/nginx/sites-available",
    progress: 1
  }
];

export const MOCK_REMOTE_META = {
  profileName: "Staging",
  host: "staging.example.com",
  port: 22,
  user: "deploy",
  connected: true
};
