export type EntryType = "file" | "directory" | "symlink" | "unknown";
export type SortKey = "name" | "size" | "mtime";
export type SortDirection = "asc" | "desc";
export type TransferDirection = "upload" | "download";
export type TransferStatus =
  | "pending"
  | "running"
  | "paused"
  | "success"
  | "failed"
  | "canceled";

export interface FileEntry {
  name: string;
  fullPath: string;
  size: number;
  mtime: string;
  type: EntryType;
}

export interface LocalFileEntry extends FileEntry {
  permissions?: string;
  isHidden: boolean;
}

export interface RemoteFileEntry extends FileEntry {
  permissions?: string;
  owner?: string;
  group?: string;
}

export interface ServerProfile {
  id: string;
  alias: string;
  host: string;
  port: number;
  username: string;
}

export interface SortState {
  key: SortKey;
  direction: SortDirection;
  directoriesFirst: boolean;
}

export interface PaneState {
  path: string;
  selection: string[];
  sort: SortState;
}

export interface TabState {
  id: string;
  connectionConfigId?: string;
  local: PaneState;
  remote: PaneState;
  transferQueueRefs: string[];
}

export interface TransferTask {
  id: string;
  tabId: string;
  direction: TransferDirection;
  source: string;
  target: string;
  status: TransferStatus;
  progressText?: string;
  speed?: string;
  currentFile?: string;
  rawLog: string[];
}
