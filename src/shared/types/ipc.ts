import type { ConnectionConfig, RemoteFileEntry, ServerProfile, TransferTask } from "./models";
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
  | "LOCAL_INFO_FAILED"
  | "LOCAL_UNKNOWN_ERROR"
  | "SYSTEM_INVALID_INPUT"
  | "SYSTEM_PREVIEW_FAILED"
  | "SYSTEM_VERSION_FAILED"
  | "REMOTE_AUTH_FAILED"
  | "REMOTE_CONNECTION_FAILED"
  | "REMOTE_PERMISSION_DENIED"
  | "REMOTE_NOT_FOUND"
  | "REMOTE_NOT_DIRECTORY"
  | "REMOTE_LIST_FAILED"
  | "REMOTE_RENAME_FAILED"
  | "REMOTE_DELETE_FAILED"
  | "REMOTE_INFO_FAILED"
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
  | "TRANSFER_PRECHECK_FAILED"
  | "TRANSFER_NOT_FOUND"
  | "TRANSFER_NOT_RUNNING"
  | "TRANSFER_QUEUE_ERROR";

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
};

export type TransferUpdatePayload = {
  tasks: TransferTask[];
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
  };
  transfer: {
    enqueueUpload: (request: EnqueueUploadRequest) => Promise<IpcResponse<{ queued: true; taskIds: string[] }>>;
    enqueueDownload: (request: EnqueueDownloadRequest) => Promise<IpcResponse<{ queued: true; taskIds: string[] }>>;
    cancel: (request: { taskId: string }) => Promise<IpcResponse<{ canceled: true }>>;
    stop: (request: { taskId: string }) => Promise<IpcResponse<{ stopped: true }>>;
    list: () => Promise<IpcResponse<TransferTask[]>>;
    clearCompleted: () => Promise<IpcResponse<{ cleared: number }>>;
    onUpdate: (handler: (payload: TransferUpdatePayload) => void) => () => void;
  };
  settings: {
    get: () => Promise<unknown>;
    set: (request: unknown) => Promise<void>;
  };
  profiles: {
    list: () => Promise<IpcResponse<ServerProfile[]>>;
    save: (request: ProfileUpsertPayload) => Promise<IpcResponse<ServerProfile>>;
    update: (request: ProfileUpsertPayload) => Promise<IpcResponse<ServerProfile>>;
    delete: (request: { id: string }) => Promise<IpcResponse<{ deleted: true }>>;
  };
  credentials: {
    isAvailable: () => Promise<IpcResponse<{ available: boolean }>>;
  };
  system: {
    copyText: (request: { text: string }) => Promise<IpcResponse<{ copied: true }>>;
    quickLook: (request: { path: string }) => Promise<IpcResponse<{ opened: true }>>;
    getAppVersion: () => Promise<IpcResponse<{ version: string }>>;
  };
}
