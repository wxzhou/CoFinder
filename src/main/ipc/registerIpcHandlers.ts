import { ipcMain } from "electron";
import { IPC_CHANNELS } from "./channels";
import { LocalFileService } from "../services/LocalFileService";
import { RemoteFileService } from "../services/RemoteFileService";
import { TransferQueueService } from "../services/TransferQueueService";
import { SettingsService } from "../services/SettingsService";

const localFileService = new LocalFileService();
const remoteFileService = new RemoteFileService();
const transferQueueService = new TransferQueueService();
const settingsService = new SettingsService();

const profiles = new Map<string, { id: string; alias: string; host: string; port: number; username: string }>();

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.local.listDirectory, (_event, request: { path: string }) =>
    localFileService.listDirectory(request.path)
  );

  ipcMain.handle(IPC_CHANNELS.local.openPath, (_event, request: { path: string }) =>
    localFileService.openPath(request.path)
  );

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
