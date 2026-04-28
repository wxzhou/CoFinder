import { ipcMain } from "electron";
import { IPC_CHANNELS } from "./channels";
import { LocalFileService } from "../services/LocalFileService";
import { RemoteFileService } from "../services/RemoteFileService";
import { TransferQueueService } from "../services/TransferQueueService";
import { SettingsService } from "../services/SettingsService";
import type { LocalErrorPayload } from "../../shared/types/ipc";

const localFileService = new LocalFileService();
const remoteFileService = new RemoteFileService();
const transferQueueService = new TransferQueueService();
const settingsService = new SettingsService();

const profiles = new Map<string, { id: string; alias: string; host: string; port: number; username: string }>();

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

  ipcMain.handle(IPC_CHANNELS.remote.connect, (_event, request: { profileId: string }) =>
    remoteFileService.connect(request.profileId)
  );

  ipcMain.handle(IPC_CHANNELS.remote.listDirectory, (_event, request: { tabId: string; path: string }) =>
    remoteFileService.listDirectory(request.tabId, request.path)
  );

  ipcMain.handle(IPC_CHANNELS.remote.disconnect, (_event, request: { tabId: string }) =>
    remoteFileService.disconnect(request.tabId)
  );

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
    (_event, request: { id: string; alias: string; host: string; port: number; username: string }) => {
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
