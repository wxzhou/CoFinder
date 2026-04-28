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
  | "REMOTE_INVALID_INPUT";

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
    list: () => Promise<ServerProfile[]>;
    save: (request: ServerProfile) => Promise<ServerProfile>;
    delete: (request: { id: string }) => Promise<void>;
  };
}
