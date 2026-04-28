import type { ServerProfile } from "./models";
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

export interface IpcApi {
  local: {
    listDirectory: (request: { path: string }) => Promise<LocalListDirectoryResponse>;
    openPath: (request: { path: string }) => Promise<void>;
  };
  remote: {
    connect: (request: { profileId: string }) => Promise<unknown>;
    listDirectory: (request: { tabId: string; path: string }) => Promise<unknown>;
    disconnect: (request: { tabId: string }) => Promise<void>;
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
