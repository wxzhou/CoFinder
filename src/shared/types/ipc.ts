import type { ConnectionConfig, RemoteFileEntry, ServerProfile } from "./models";
import type { LocalFileEntry } from "./models";

export type LocalErrorCode = "NOT_FOUND" | "PERMISSION_DENIED" | "NOT_DIRECTORY" | "OPEN_FAILED" | "UNKNOWN";

export interface LocalErrorPayload {
  code: LocalErrorCode;
  message: string;
}

export interface LocalListDirectoryResponse {
  path: string;
  entries: LocalFileEntry[];
}

export type RemoteErrorCode =
  | "REMOTE_AUTH_FAILED"
  | "REMOTE_CONNECTION_FAILED"
  | "REMOTE_PERMISSION_DENIED"
  | "REMOTE_NOT_FOUND"
  | "REMOTE_NOT_DIRECTORY"
  | "REMOTE_LIST_FAILED"
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
  | "CREDENTIAL_UNAVAILABLE";

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
    listDirectory: (request: { path: string }) => Promise<LocalListDirectoryResponse>;
    openPath: (request: { path: string }) => Promise<void>;
  };
  remote: {
    connect: (request: RemoteConnectRequest) => Promise<IpcResponse<RemoteConnectResponse>>;
    listDirectory: (request: RemoteListDirectoryRequest) => Promise<IpcResponse<RemoteListDirectoryResponse>>;
    disconnect: (request: { connectionId: string }) => Promise<IpcResponse<{ disconnected: true }>>;
    getHomeDirectory: (request: { connectionId: string }) => Promise<IpcResponse<{ homePath: string }>>;
  };
  transfer: {
    enqueueUpload: (request: { tabId: string; sources: string[]; target: string }) => Promise<unknown>;
    enqueueDownload: (request: { tabId: string; sources: string[]; target: string }) => Promise<unknown>;
    cancel: (request: { taskId: string }) => Promise<void>;
    onUpdate: (handler: (payload: unknown) => void) => () => void;
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
}
