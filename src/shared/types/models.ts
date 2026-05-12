export type EntryType = "file" | "directory" | "symlink" | "unknown";
export type SortKey = "name" | "size" | "mtime";
export type SortDirection = "asc" | "desc";
export type TransferDirection = "upload" | "download";
export type TransferStatus =
  | "checking"
  | "conflict"
  | "pending"
  | "running"
  | "success"
  | "skipped"
  | "failed"
  | "canceled"
  | "stopped";
export type TransferErrorCategory =
  | "rsync_not_found"
  | "ssh_batchmode_failed"
  | "permission_denied"
  | "path_not_found"
  | "no_space_left"
  | "remote_disconnected"
  | "unknown";

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
  isHidden?: boolean;
}

export interface ServerProfile {
  id: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  defaultRemotePath?: string;
  remoteFavorites?: RemoteFavorite[];
  authType: "password" | "privateKey";
  privateKeyPath?: string;
  /** Runtime-only: set when listing profiles; never persisted in profiles.json */
  hasSavedPassword?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RemoteFavorite {
  id: string;
  label: string;
  path: string;
  createdAt: number;
}

export interface ConnectionConfig {
  profileId?: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  defaultRemotePath?: string;
  authType?: "password" | "privateKey";
}

export interface SortState {
  key: SortKey;
  direction: SortDirection;
  directoriesFirst: boolean;
}

export interface AppError {
  code: string;
  message: string;
  detail?: string;
}

export interface PaneState<TEntry extends FileEntry = FileEntry> {
  currentPath: string;
  entries: TEntry[];
  selectedFullPaths: string[];
  sort: SortState;
  historyBack: string[];
  historyForward: string[];
  isLoading: boolean;
  error?: AppError;
}

export interface RemotePaneState extends PaneState<RemoteFileEntry> {
  connectionStatus: "disconnected" | "connecting" | "connected" | "failed";
  connectionId?: string;
  profileId?: string;
  connectionLabel?: string;
  formDraft?: {
    alias?: string;
    host?: string;
    port?: number;
    username?: string;
    initialPath?: string;
    saveProfile?: boolean;
  };
}

export interface TabState {
  id: string;
  title: string;
  createdAt: number;
  localPane: PaneState<LocalFileEntry>;
  remotePane: RemotePaneState;
}

export interface TransferTask {
  id: string;
  tabId: string;
  direction: TransferDirection;
  source: string;
  destination: string;
  sourceDisplay: string;
  destinationDisplay: string;
  profileId?: string;
  connectionId?: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  localPath: string;
  preserveTimestamps?: boolean;
  status: TransferStatus;
  progressText?: string;
  percent?: number;
  speed?: string;
  eta?: string;
  currentFile?: string;
  rawLog: string[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  errorCode?: TransferErrorCategory;
}
