import type { LocalFavoriteListItem } from "../localFavorites";
import type { ConnectionConfig, EntryType, RemoteFileEntry, ServerProfile, TransferTask } from "./models";
import type { LocalFileEntry } from "./models";

export type LocalErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "NOT_DIRECTORY"
  | "OPEN_FAILED"
  | "RENAME_FAILED"
  | "DELETE_FAILED"
  | "INFO_FAILED"
  | "UNKNOWN";

export type PathInfo = {
  name: string;
  fullPath: string;
  type: "file" | "directory" | "symlink" | "unknown";
  size: number;
  mtime: string;
  permissions?: string;
  owner?: string;
  group?: string;
  fileCount?: number;
  folderCount?: number;
};

export interface LocalErrorPayload {
  code: LocalErrorCode;
  message: string;
}

export interface LocalListDirectoryResponse {
  path: string;
  entries: LocalFileEntry[];
}

export type RemoteErrorCode =
  | "LOCAL_INVALID_INPUT"
  | "LOCAL_NOT_FOUND"
  | "LOCAL_PERMISSION_DENIED"
  | "LOCAL_NOT_DIRECTORY"
  | "LOCAL_OPEN_FAILED"
  | "LOCAL_RENAME_FAILED"
  | "LOCAL_DELETE_FAILED"
  | "LOCAL_MKDIR_FAILED"
  | "LOCAL_CREATE_FILE_FAILED"
  | "LOCAL_INFO_FAILED"
  | "LOCAL_UNKNOWN_ERROR"
  | "SYSTEM_INVALID_INPUT"
  | "SYSTEM_PREVIEW_FAILED"
  | "SYSTEM_VERSION_FAILED"
  | "SYSTEM_DIAGNOSTICS_FAILED"
  | "SYSTEM_LOG_OPEN_FAILED"
  | "SYSTEM_UPDATE_CHECK_UNAVAILABLE"
  | "REMOTE_AUTH_FAILED"
  | "REMOTE_CONNECTION_FAILED"
  | "REMOTE_PERMISSION_DENIED"
  | "REMOTE_NOT_FOUND"
  | "REMOTE_NOT_DIRECTORY"
  | "REMOTE_LIST_FAILED"
  | "REMOTE_RENAME_FAILED"
  | "REMOTE_DELETE_FAILED"
  | "REMOTE_INFO_FAILED"
  | "REMOTE_MKDIR_FAILED"
  | "REMOTE_CREATE_FILE_FAILED"
  | "REMOTE_CHMOD_FAILED"
  | "REMOTE_DUPLICATE_FAILED"
  | "REMOTE_DIRECTORY_SIZE_FAILED"
  | "REMOTE_PREVIEW_UNSUPPORTED"
  | "REMOTE_PREVIEW_FAILED"
  | "REMOTE_DISCONNECTED"
  | "REMOTE_UNKNOWN_ERROR"
  | "REMOTE_INVALID_INPUT"
  | "PROFILE_LOAD_FAILED"
  | "PROFILE_SAVE_FAILED"
  | "PROFILE_DELETE_FAILED"
  | "PROFILE_INVALID"
  | "CREDENTIAL_SAVE_FAILED"
  | "CREDENTIAL_LOAD_FAILED"
  | "CREDENTIAL_DELETE_FAILED"
  | "CREDENTIAL_UNAVAILABLE"
  | "TRANSFER_INVALID_REQUEST"
  | "TRANSFER_CONFLICT"
  | "TRANSFER_PRECHECK_FAILED"
  | "TRANSFER_NOT_FOUND"
  | "TRANSFER_NOT_RUNNING"
  | "TRANSFER_QUEUE_ERROR"
  | "LOCAL_FAVORITES_DUPLICATE"
  | "LOCAL_FAVORITES_NOT_FOUND"
  | "LOCAL_FAVORITES_PERSIST_FAILED"
  | "SETTINGS_LOAD_FAILED"
  | "SETTINGS_SAVE_FAILED"
  | "SETTINGS_INVALID";

export interface RemoteErrorPayload {
  code: RemoteErrorCode;
  message: string;
  detail?: string;
}

export interface IpcSuccessResponse<T> {
  ok: true;
  data: T;
}

export interface IpcFailureResponse {
  ok: false;
  error: RemoteErrorPayload;
}

export type IpcResponse<T> = IpcSuccessResponse<T> | IpcFailureResponse;

export interface RemoteConnectRequest extends ConnectionConfig {
  saveProfile?: boolean;
  alias?: string;
}

export interface RemoteConnectResponse {
  connectionId: string;
  homePath: string;
}

export interface RemoteListDirectoryRequest {
  connectionId: string;
  path: string;
}

export interface RemoteListDirectoryResponse {
  path: string;
  entries: RemoteFileEntry[];
}

export type EnqueueUploadRequest = {
  tabId: string;
  profileId?: string;
  connectionId?: string;
  host: string;
  port: number;
  username: string;
  authType?: "password" | "privateKey";
  localSources: string[];
  remoteDestinationDir: string;
  conflictPolicy?: TransferConflictPolicy;
  preserveTimestamps?: boolean;
  remoteTargetOverrides?: Record<string, string>;
};

export type EnqueueDownloadRequest = {
  tabId: string;
  profileId?: string;
  connectionId?: string;
  host: string;
  port: number;
  username: string;
  authType?: "password" | "privateKey";
  remoteSources: string[];
  localDestinationDir: string;
  conflictPolicy?: TransferConflictPolicy;
  preserveTimestamps?: boolean;
  localTargetOverrides?: Record<string, string>;
};

export type TransferConflictPolicy = "prompt" | "overwrite" | "skip" | "rename" | "cancel";

export type AppSettings = {
  schemaVersion: 2;
  general: {
    defaultLocalPath: string;
    restoreLastSession: boolean;
    confirmBeforeDelete: boolean;
    showHiddenFiles: boolean;
    firstRunOnboardingDismissed: boolean;
  };
  transfer: {
    defaultConflictPolicy: Exclude<TransferConflictPolicy, "cancel">;
    queueAutoHideDelayMs: number;
    preserveTimestamps: boolean;
  };
  appearance: {
    rowDensity: "compact" | "comfortable";
    defaultInspectorVisible: boolean;
    defaultPaneRatio: number;
    sidebarVisible: boolean;
  };
};

export type ToolAvailability = {
  available: boolean;
  detail?: string;
};

export type DiagnosticsBundle = {
  generatedAt: string;
  appVersion: string;
  platform: string;
  arch: string;
  userDataPath: string;
  logFilePath: string;
  logFileExists: boolean;
  tools: {
    ssh: ToolAvailability;
    rsync: ToolAvailability;
  };
  updatePolicy: {
    mode: "manual-github-release";
    status: string;
  };
};

export type TransferConflict = {
  source: string;
  target: string;
  targetType: EntryType;
};

export type TransferConflictCheckResponse = {
  conflicts: TransferConflict[];
};

export type TransferUpdatePayload = {
  tasks: TransferTask[];
};

export type RemoteDirectorySizeUpdatePayload = {
  jobId: string;
  connectionId: string;
  path: string;
  status: "running" | "success" | "failed" | "canceled";
  size?: number;
  visitedEntries?: number;
  capped?: boolean;
  error?: string;
};

/** Sent from Site Manager to create/update a profile; password is never persisted in profiles.json. */
export type ProfileUpsertPayload = {
  id?: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  defaultRemotePath?: string;
  authType: "password" | "privateKey";
  privateKeyPath?: string;
  password?: string;
  savePassword: boolean;
};

export interface IpcApi {
  local: {
    listDirectory: (request: { path: string }) => Promise<IpcResponse<LocalListDirectoryResponse>>;
    openPath: (request: { path: string }) => Promise<IpcResponse<{ opened: true }>>;
    revealPath: (request: { path: string }) => Promise<IpcResponse<{ revealed: true }>>;
    getHomePath: () => Promise<IpcResponse<{ homePath: string }>>;
    rename: (request: { path: string; newName: string }) => Promise<IpcResponse<{ renamed: true; newPath: string }>>;
    delete: (request: { paths: string[] }) => Promise<IpcResponse<{ deleted: number }>>;
    mkdir: (request: { parentPath: string; name: string }) => Promise<IpcResponse<{ created: true; path: string }>>;
    createTextFile: (request: { parentPath: string; name?: string }) => Promise<IpcResponse<{ created: true; path: string }>>;
    getInfo: (request: { path: string; includeDirectorySize?: boolean }) => Promise<IpcResponse<{ info: PathInfo }>>;
  };
  remote: {
    connect: (request: RemoteConnectRequest) => Promise<IpcResponse<RemoteConnectResponse>>;
    listDirectory: (request: RemoteListDirectoryRequest) => Promise<IpcResponse<RemoteListDirectoryResponse>>;
    disconnect: (request: { connectionId: string }) => Promise<IpcResponse<{ disconnected: true }>>;
    getHomeDirectory: (request: { connectionId: string }) => Promise<IpcResponse<{ homePath: string }>>;
    rename: (request: {
      connectionId: string;
      path: string;
      newName: string;
    }) => Promise<IpcResponse<{ renamed: true; newPath: string }>>;
    delete: (request: { connectionId: string; paths: string[] }) => Promise<IpcResponse<{ deleted: number }>>;
    getInfo: (request: {
      connectionId: string;
      path: string;
      includeDirectorySize?: boolean;
    }) => Promise<IpcResponse<{ info: PathInfo }>>;
    mkdir: (request: { connectionId: string; parentPath: string; name: string }) => Promise<IpcResponse<{ created: true; path: string }>>;
    createTextFile: (request: {
      connectionId: string;
      parentPath: string;
      name?: string;
    }) => Promise<IpcResponse<{ created: true; path: string }>>;
    chmod: (request: { connectionId: string; path: string; mode: string }) => Promise<IpcResponse<{ changed: true }>>;
    duplicate: (request: { connectionId: string; path: string }) => Promise<IpcResponse<{ duplicated: true; newPath: string }>>;
    directorySizeStart: (request: { connectionId: string; path: string }) => Promise<IpcResponse<{ jobId: string }>>;
    directorySizeCancel: (request: { jobId: string }) => Promise<IpcResponse<{ canceled: true }>>;
    onDirectorySizeUpdate: (handler: (payload: RemoteDirectorySizeUpdatePayload) => void) => () => void;
    previewOpen: (request: {
      tabId: string;
      connectionId: string;
      path: string;
    }) => Promise<IpcResponse<{ opened: true; localPath: string; kind: "text" | "image" }>>;
    previewClearForTab: (request: { tabId: string }) => Promise<IpcResponse<{ cleared: number }>>;
    previewClearForConnection: (request: { connectionId: string }) => Promise<IpcResponse<{ cleared: number }>>;
  };
  transfer: {
    checkUploadConflicts: (request: EnqueueUploadRequest) => Promise<IpcResponse<TransferConflictCheckResponse>>;
    checkDownloadConflicts: (request: EnqueueDownloadRequest) => Promise<IpcResponse<TransferConflictCheckResponse>>;
    enqueueUpload: (request: EnqueueUploadRequest) => Promise<IpcResponse<{ queued: true; taskIds: string[] }>>;
    enqueueDownload: (request: EnqueueDownloadRequest) => Promise<IpcResponse<{ queued: true; taskIds: string[] }>>;
    cancel: (request: { taskId: string }) => Promise<IpcResponse<{ canceled: true }>>;
    stop: (request: { taskId: string }) => Promise<IpcResponse<{ stopped: true }>>;
    retry: (request: { taskId: string }) => Promise<IpcResponse<{ retried: true }>>;
    retryFailed: () => Promise<IpcResponse<{ retried: number }>>;
    list: () => Promise<IpcResponse<TransferTask[]>>;
    clearCompleted: () => Promise<IpcResponse<{ cleared: number }>>;
    onUpdate: (handler: (payload: TransferUpdatePayload) => void) => () => void;
  };
  settings: {
    get: () => Promise<IpcResponse<AppSettings>>;
    set: (request: unknown) => Promise<IpcResponse<AppSettings>>;
  };
  localFavorites: {
    list: () => Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>>;
    add: (request: { path: string }) => Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>>;
    remove: (request: { id: string }) => Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>>;
    rename: (request: { id: string; label: string }) => Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>>;
    reorder: (request: { id: string; direction: "up" | "down" }) => Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>>;
    resetDefaults: () => Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>>;
  };
  profiles: {
    list: () => Promise<IpcResponse<ServerProfile[]>>;
    save: (request: ProfileUpsertPayload) => Promise<IpcResponse<ServerProfile>>;
    update: (request: ProfileUpsertPayload) => Promise<IpcResponse<ServerProfile>>;
    delete: (request: { id: string }) => Promise<IpcResponse<{ deleted: true }>>;
    addRemoteFavorite: (request: { profileId: string; path: string }) => Promise<IpcResponse<ServerProfile>>;
    removeRemoteFavorite: (request: { profileId: string; favoriteId: string }) => Promise<IpcResponse<ServerProfile>>;
    renameRemoteFavorite: (request: { profileId: string; favoriteId: string; label: string }) => Promise<IpcResponse<ServerProfile>>;
    reorderRemoteFavorite: (request: {
      profileId: string;
      favoriteId: string;
      direction: "up" | "down";
    }) => Promise<IpcResponse<ServerProfile>>;
  };
  credentials: {
    isAvailable: () => Promise<IpcResponse<{ available: boolean }>>;
  };
  system: {
    copyText: (request: { text: string }) => Promise<IpcResponse<{ copied: true }>>;
    quickLook: (request: { path: string }) => Promise<IpcResponse<{ opened: true }>>;
    openTerminal: (request: { path: string }) => Promise<IpcResponse<{ opened: true }>>;
    openSshTerminal: (request: { host: string; port: number; username: string; remotePath?: string }) => Promise<IpcResponse<{ opened: true }>>;
    getAppVersion: () => Promise<IpcResponse<{ version: string }>>;
    openLogFolder: () => Promise<IpcResponse<{ opened: true; path: string }>>;
    openLogFile: () => Promise<IpcResponse<{ opened: true; path: string }>>;
    copyDiagnostics: () => Promise<IpcResponse<{ copied: true; diagnostics: DiagnosticsBundle }>>;
    checkForUpdates: () => Promise<IpcResponse<{ available: false; message: string }>>;
  };
}
