import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { IPC_CHANNELS } from "./channels";
import { LocalFileService } from "../services/LocalFileService";
import { RemoteFileService } from "../services/RemoteFileService";
import { TransferQueueService } from "../services/TransferQueueService";
import { SettingsService } from "../services/SettingsService";
import { ConnectionManager } from "../services/ConnectionManager";
import type {
  IpcFailureResponse,
  IpcResponse,
  LocalErrorPayload,
  RemoteConnectRequest,
  RemoteConnectResponse,
  RemoteListDirectoryRequest,
  RemoteListDirectoryResponse
} from "../../shared/types/ipc";
import type { ServerProfile } from "../../shared/types/models";

const localFileService = new LocalFileService();
const connectionManager = new ConnectionManager();
const remoteFileService = new RemoteFileService(connectionManager);
const transferQueueService = new TransferQueueService();
const settingsService = new SettingsService();

const profiles = new Map<string, ServerProfile>();

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.local.listDirectory, async (_event, request: { path: string }) => {
    try {
      return await localFileService.listDirectory(request.path);
    } catch (error) {
      throw toIpcError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.local.openPath, async (_event, request: { path: string }) => {
    try {
      await localFileService.openPath(request.path);
    } catch (error) {
      throw toIpcError(error);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.remote.connect,
    async (_event, request: RemoteConnectRequest): Promise<IpcResponse<RemoteConnectResponse>> => {
      try {
        const data = await remoteFileService.connect({
          host: request.host,
          port: request.port,
          username: request.username,
          password: request.password,
          profileId: request.profileId,
          defaultRemotePath: request.defaultRemotePath
        });
        if (request.saveProfile) {
          const profile: ServerProfile = {
            id: request.profileId ?? randomUUID(),
            alias: request.alias?.trim() || request.host,
            host: request.host,
            port: request.port,
            username: request.username,
            defaultRemotePath: request.defaultRemotePath,
            authType: "password"
          };
          profiles.set(profile.id, profile);
        }
        return { ok: true, data };
      } catch (error) {
        return toIpcResponseError(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.remote.listDirectory,
    async (_event, request: RemoteListDirectoryRequest): Promise<IpcResponse<RemoteListDirectoryResponse>> => {
      try {
        const data = await remoteFileService.listDirectory(request.connectionId, request.path);
        return { ok: true, data };
      } catch (error) {
        return toIpcResponseError(error);
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.remote.getHomeDirectory, async (_event, request: { connectionId: string }) => {
    try {
      const homePath = await remoteFileService.getHomeDirectory(request.connectionId);
      return { ok: true, data: { homePath } };
    } catch (error) {
      return toIpcResponseError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.remote.disconnect, async (_event, request: { connectionId: string }) => {
    try {
      await remoteFileService.disconnect(request.connectionId);
      return { ok: true, data: { disconnected: true as const } };
    } catch (error) {
      return toIpcResponseError(error);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.transfer.enqueueUpload,
    (_event, request: { tabId: string; sources: string[]; target: string }) =>
      transferQueueService.enqueueUpload(request.tabId, request.sources, request.target)
  );

  ipcMain.handle(
    IPC_CHANNELS.transfer.enqueueDownload,
    (_event, request: { tabId: string; sources: string[]; target: string }) =>
      transferQueueService.enqueueDownload(request.tabId, request.sources, request.target)
  );

  ipcMain.handle(IPC_CHANNELS.transfer.cancel, (_event, request: { taskId: string }) =>
    transferQueueService.cancel(request.taskId)
  );

  ipcMain.handle(IPC_CHANNELS.settings.get, () => settingsService.get());
  ipcMain.handle(IPC_CHANNELS.settings.set, (_event, request: Record<string, unknown>) => settingsService.set(request));

  ipcMain.handle(IPC_CHANNELS.profiles.list, () => Array.from(profiles.values()));
  ipcMain.handle(
    IPC_CHANNELS.profiles.save,
    (_event, request: ServerProfile) => {
      profiles.set(request.id, request);
      return request;
    }
  );
  ipcMain.handle(IPC_CHANNELS.profiles.delete, (_event, request: { id: string }) => {
    profiles.delete(request.id);
  });
}

function toIpcError(error: unknown): Error {
  const payload: LocalErrorPayload = {
    code: "UNKNOWN",
    message: "Unexpected local operation failure."
  };
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    payload.code = String(error.code) as LocalErrorPayload["code"];
    payload.message = String(error.message);
  }
  return new Error(JSON.stringify(payload));
}

function toIpcResponseError(error: unknown): IpcFailureResponse {
  const base: IpcFailureResponse = {
    ok: false,
    error: {
      code: "REMOTE_UNKNOWN_ERROR",
      message: "Unexpected remote error."
    }
  };
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return {
      ok: false,
      error: {
        code: String(error.code) as IpcFailureResponse["error"]["code"],
        message: String(error.message),
        detail: "detail" in error ? String(error.detail) : undefined
      }
    };
  }
  return base;
}
