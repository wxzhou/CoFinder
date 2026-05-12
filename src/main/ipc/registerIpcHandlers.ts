import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "./channels";
import {
  AppError,
  asRecord,
  fail,
  normalizeRemotePathInput,
  ok,
  optionalString,
  requiredHost,
  requiredId,
  requiredPort,
  requiredString,
  requiredUsername,
  toIpcError,
  validateLocalPathInput
} from "./ipcUtils";
import { LocalFileService } from "../services/LocalFileService";
import { RemoteFileService } from "../services/RemoteFileService";
import { TransferQueueService } from "../services/TransferQueueService";
import { SettingsService, defaultSettingsPath } from "../services/SettingsService";
import { DiagnosticsService } from "../services/DiagnosticsService";
import { ConnectionManager } from "../services/ConnectionManager";
import { CredentialService } from "../services/CredentialService";
import {
  LocalSidebarFavoritesRepository,
  defaultLocalSidebarFavoritesPath
} from "../services/LocalSidebarFavoritesRepository";
import { ProfileRepository, defaultCredentialsPath, defaultProfilesPath } from "../services/ProfileRepository";
import { SafeStorageCredentialProvider } from "../services/SafeStorageCredentialProvider";
import { QuickLookService } from "../services/QuickLookService";
import { RemotePreviewService } from "../services/RemotePreviewService";
import type {
  EnqueueDownloadRequest,
  EnqueueUploadRequest,
  IpcResponse,
  ProfileUpsertPayload,
  RemoteConnectRequest,
  RemoteConnectResponse,
  TransferConflict,
  TransferConflictCheckResponse,
  TransferUpdatePayload,
  RemoteDirectorySizeUpdatePayload,
  RemoteListDirectoryRequest,
  RemoteListDirectoryResponse
} from "../../shared/types/ipc";
import type { LocalFavoriteListItem } from "../../shared/localFavorites";
import type { EntryType, ServerProfile } from "../../shared/types/models";

const localFileService = new LocalFileService();
const connectionManager = new ConnectionManager();
const remoteFileService = new RemoteFileService(connectionManager);
const transferQueueService = new TransferQueueService();
const userData = app.getPath("userData");
const mainLogFilePath = path.join(userData, "main.log");
const settingsService = new SettingsService(defaultSettingsPath(userData));
const diagnosticsService = new DiagnosticsService({
  version: app.getVersion(),
  userDataPath: userData,
  logFilePath: mainLogFilePath
});
const quickLookService = new QuickLookService();
const remotePreviewService = new RemotePreviewService(connectionManager, app.getPath("temp"));

const localSidebarFavoritesRepository = new LocalSidebarFavoritesRepository(defaultLocalSidebarFavoritesPath(userData), () => ({
  home: app.getPath("home"),
  desktop: app.getPath("desktop"),
  downloads: app.getPath("downloads"),
  documents: app.getPath("documents")
}));
const profileRepository = new ProfileRepository(defaultProfilesPath(userData));
const credentialProvider = new SafeStorageCredentialProvider(defaultCredentialsPath(userData));
const credentialService = new CredentialService(credentialProvider);
const registeredChannels: string[] = [];
let transferOff: (() => void) | null = null;
let isRegistered = false;
const remoteSizeJobs = new Map<string, AbortController>();

function registerChannel<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (_event: Electron.IpcMainInvokeEvent, ...args: TArgs) => TResult
): void {
  ipcMain.handle(channel, handler);
  registeredChannels.push(channel);
}

export function registerIpcHandlers(): void {
  if (isRegistered) return;
  isRegistered = true;

  transferOff = transferQueueService.onUpdate((payload: TransferUpdatePayload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.transfer.onUpdate, payload);
    }
  });

  registerChannel(IPC_CHANNELS.local.listDirectory, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid local:listDirectory request.");
      const targetPath = validateLocalPathInput(body.path, "LOCAL_INVALID_INPUT");
      return ok(await localFileService.listDirectory(targetPath));
    } catch (error) {
      return toIpcError(error, "LOCAL_UNKNOWN_ERROR", "Unexpected local operation failure.");
    }
  });

  registerChannel(IPC_CHANNELS.local.openPath, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid local:openPath request.");
      const targetPath = validateLocalPathInput(body.path, "LOCAL_INVALID_INPUT");
      await localFileService.openPath(targetPath);
      return ok({ opened: true as const });
    } catch (error) {
      return toIpcError(error, "LOCAL_UNKNOWN_ERROR", "Unexpected local operation failure.");
    }
  });

  registerChannel(IPC_CHANNELS.local.revealPath, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid local:revealPath request.");
      const targetPath = validateLocalPathInput(body.path, "LOCAL_INVALID_INPUT");
      await localFileService.revealPath(targetPath);
      return ok({ revealed: true as const });
    } catch (error) {
      return toIpcError(error, "LOCAL_UNKNOWN_ERROR", "Unexpected local operation failure.");
    }
  });

  registerChannel(IPC_CHANNELS.local.getHomePath, async () => {
    try {
      return ok({ homePath: app.getPath("home") });
    } catch (error) {
      return toIpcError(error, "LOCAL_UNKNOWN_ERROR", "Failed to resolve home path.");
    }
  });

  registerChannel(IPC_CHANNELS.local.rename, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid local:rename request.");
      const targetPath = validateLocalPathInput(body.path, "LOCAL_INVALID_INPUT");
      const newName = requiredString(body.newName, "newName", "LOCAL_INVALID_INPUT");
      const newPath = await localFileService.renamePath(targetPath, newName);
      return ok({ renamed: true as const, newPath });
    } catch (error) {
      return toIpcError(error, "LOCAL_RENAME_FAILED", "Failed to rename local path.");
    }
  });

  registerChannel(IPC_CHANNELS.local.delete, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid local:delete request.");
      if (!Array.isArray(body.paths) || body.paths.length === 0) {
        throw new AppError("LOCAL_INVALID_INPUT", "Select at least one local path.");
      }
      const paths = body.paths.map((item) => validateLocalPathInput(item, "LOCAL_INVALID_INPUT", "path"));
      const deleted = await localFileService.deletePaths(paths);
      return ok({ deleted });
    } catch (error) {
      return toIpcError(error, "LOCAL_DELETE_FAILED", "Failed to delete local paths.");
    }
  });

  registerChannel(IPC_CHANNELS.local.getInfo, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid local:getInfo request.");
      const targetPath = validateLocalPathInput(body.path, "LOCAL_INVALID_INPUT");
      const info = await localFileService.getPathInfo(targetPath, {
        includeDirectorySize: body.includeDirectorySize !== false
      });
      return ok({ info });
    } catch (error) {
      return toIpcError(error, "LOCAL_INFO_FAILED", "Failed to load local path info.");
    }
  });

  registerChannel(
    IPC_CHANNELS.remote.connect,
    async (_event, request: unknown): Promise<IpcResponse<RemoteConnectResponse>> => {
      try {
        const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:connect request.");
        const connectRequest: RemoteConnectRequest = {
          host: requiredHost(body.host, "REMOTE_INVALID_INPUT"),
          port: requiredPort(body.port, "REMOTE_INVALID_INPUT"),
          username: requiredUsername(body.username, "REMOTE_INVALID_INPUT"),
          password: optionalString(body.password),
          profileId: optionalString(body.profileId),
          defaultRemotePath: optionalString(body.defaultRemotePath),
          privateKeyPath: optionalString(body.privateKeyPath),
          authType: body.authType === "privateKey" ? "privateKey" : "password"
        };
        let password = connectRequest.password?.trim() ?? "";
        if (!password && connectRequest.profileId) {
          password = (await credentialService.get(connectRequest.profileId))?.trim() ?? "";
        }
        const data = await remoteFileService.connect({
          host: connectRequest.host,
          port: connectRequest.port,
          username: connectRequest.username,
          password,
          profileId: connectRequest.profileId,
          defaultRemotePath: connectRequest.defaultRemotePath,
          privateKeyPath: connectRequest.privateKeyPath,
          authType: connectRequest.authType
        });
        return ok(data);
      } catch (error) {
        return toIpcError(error, "REMOTE_UNKNOWN_ERROR", "Unexpected remote error.");
      }
    }
  );

  registerChannel(
    IPC_CHANNELS.remote.listDirectory,
    async (_event, request: unknown): Promise<IpcResponse<RemoteListDirectoryResponse>> => {
      try {
        const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:listDirectory request.");
        const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
        const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
        const data = await remoteFileService.listDirectory(connectionId, targetPath);
        return ok(data);
      } catch (error) {
        return toIpcError(error, "REMOTE_UNKNOWN_ERROR", "Unexpected remote error.");
      }
    }
  );

  registerChannel(IPC_CHANNELS.remote.getHomeDirectory, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:getHomeDirectory request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const homePath = await remoteFileService.getHomeDirectory(connectionId);
      return ok({ homePath });
    } catch (error) {
      return toIpcError(error, "REMOTE_UNKNOWN_ERROR", "Unexpected remote error.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.disconnect, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:disconnect request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      await remoteFileService.disconnect(connectionId);
      await remotePreviewService.clearForConnection(connectionId);
      return ok({ disconnected: true as const });
    } catch (error) {
      return toIpcError(error, "REMOTE_UNKNOWN_ERROR", "Unexpected remote error.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.rename, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:rename request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
      const newName = requiredString(body.newName, "newName", "REMOTE_INVALID_INPUT");
      const newPath = await remoteFileService.renamePath(connectionId, targetPath, newName);
      return ok({ renamed: true as const, newPath });
    } catch (error) {
      return toIpcError(error, "REMOTE_RENAME_FAILED", "Failed to rename remote path.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.delete, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:delete request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      if (!Array.isArray(body.paths) || body.paths.length === 0) {
        throw new AppError("REMOTE_INVALID_INPUT", "Select at least one remote path.");
      }
      const paths = body.paths.map((item) => normalizeRemotePathInput(item, "REMOTE_INVALID_INPUT", "path"));
      const deleted = await remoteFileService.deletePaths(connectionId, paths);
      return ok({ deleted });
    } catch (error) {
      return toIpcError(error, "REMOTE_DELETE_FAILED", "Failed to delete remote paths.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.getInfo, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:getInfo request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
      const info = await remoteFileService.getPathInfo(connectionId, targetPath, {
        includeDirectorySize: body.includeDirectorySize !== false
      });
      return ok({ info });
    } catch (error) {
      return toIpcError(error, "REMOTE_INFO_FAILED", "Failed to load remote path info.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.mkdir, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:mkdir request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const parentPath = normalizeRemotePathInput(body.parentPath, "REMOTE_INVALID_INPUT", "parentPath");
      const name = requiredString(body.name, "name", "REMOTE_INVALID_INPUT", undefined, { maxLength: 255 });
      const createdPath = await remoteFileService.makeDirectory(connectionId, parentPath, name);
      return ok({ created: true as const, path: createdPath });
    } catch (error) {
      return toIpcError(error, "REMOTE_MKDIR_FAILED", "Failed to create remote directory.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.chmod, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:chmod request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
      const modeText = requiredString(body.mode, "mode", "REMOTE_INVALID_INPUT");
      if (!/^[0-7]{3}$/.test(modeText)) throw new AppError("REMOTE_INVALID_INPUT", "Mode must be three octal digits, for example 644.");
      await remoteFileService.chmodPath(connectionId, targetPath, Number.parseInt(modeText, 8));
      return ok({ changed: true as const });
    } catch (error) {
      return toIpcError(error, "REMOTE_CHMOD_FAILED", "Failed to change remote permissions.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.duplicate, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:duplicate request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
      const newPath = await remoteFileService.duplicateFile(connectionId, targetPath);
      return ok({ duplicated: true as const, newPath });
    } catch (error) {
      return toIpcError(error, "REMOTE_DUPLICATE_FAILED", "Failed to duplicate remote file.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.directorySizeStart, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:directorySizeStart request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
      const jobId = randomUUID();
      const controller = new AbortController();
      remoteSizeJobs.set(jobId, controller);
      sendRemoteDirectorySizeUpdate({ jobId, connectionId, path: targetPath, status: "running" });
      void (async () => {
        try {
          const result = await remoteFileService.calculateDirectorySize(connectionId, targetPath, { signal: controller.signal });
          if (controller.signal.aborted) {
            sendRemoteDirectorySizeUpdate({ jobId, connectionId, path: targetPath, status: "canceled" });
            return;
          }
          sendRemoteDirectorySizeUpdate({
            jobId,
            connectionId,
            path: targetPath,
            status: "success",
            size: result.size,
            visitedEntries: result.visitedEntries,
            capped: result.capped
          });
        } catch (error) {
          if (controller.signal.aborted) {
            sendRemoteDirectorySizeUpdate({ jobId, connectionId, path: targetPath, status: "canceled" });
            return;
          }
          const ipc = toIpcError(error, "REMOTE_DIRECTORY_SIZE_FAILED", "Failed to calculate remote directory size.");
          sendRemoteDirectorySizeUpdate({
            jobId,
            connectionId,
            path: targetPath,
            status: "failed",
            error: ipc.error.message
          });
        } finally {
          remoteSizeJobs.delete(jobId);
        }
      })();
      return ok({ jobId });
    } catch (error) {
      return toIpcError(error, "REMOTE_DIRECTORY_SIZE_FAILED", "Failed to start remote directory size.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.directorySizeCancel, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:directorySizeCancel request.");
      const jobId = requiredId(body.jobId, "jobId", "REMOTE_INVALID_INPUT");
      remoteSizeJobs.get(jobId)?.abort();
      remoteSizeJobs.delete(jobId);
      return ok({ canceled: true as const });
    } catch (error) {
      return toIpcError(error, "REMOTE_DIRECTORY_SIZE_FAILED", "Failed to cancel remote directory size.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.previewOpen, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:previewOpen request.");
      const tabId = requiredId(body.tabId, "tabId", "REMOTE_INVALID_INPUT");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      const targetPath = normalizeRemotePathInput(body.path, "REMOTE_INVALID_INPUT", "path");
      return ok(await remotePreviewService.openPreview({ tabId, connectionId, remotePath: targetPath }));
    } catch (error) {
      return toIpcError(error, "REMOTE_PREVIEW_FAILED", "Failed to preview remote file.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.previewClearForTab, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:previewClearForTab request.");
      const tabId = requiredId(body.tabId, "tabId", "REMOTE_INVALID_INPUT");
      return ok({ cleared: await remotePreviewService.clearForTab(tabId) });
    } catch (error) {
      return toIpcError(error, "REMOTE_PREVIEW_FAILED", "Failed to clear remote preview cache.");
    }
  });

  registerChannel(IPC_CHANNELS.remote.previewClearForConnection, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "REMOTE_INVALID_INPUT", "Invalid remote:previewClearForConnection request.");
      const connectionId = requiredId(body.connectionId, "connectionId", "REMOTE_INVALID_INPUT");
      return ok({ cleared: await remotePreviewService.clearForConnection(connectionId) });
    } catch (error) {
      return toIpcError(error, "REMOTE_PREVIEW_FAILED", "Failed to clear remote preview cache.");
    }
  });

  registerChannel(
    IPC_CHANNELS.transfer.checkUploadConflicts,
    async (_event, request: unknown): Promise<IpcResponse<TransferConflictCheckResponse>> => {
      try {
        const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:checkUploadConflicts request.");
        const req = parseUploadRequest(body);
        return ok({ conflicts: await checkUploadConflicts(req) });
      } catch (error) {
        return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Failed to check upload conflicts.");
      }
    }
  );

  registerChannel(
    IPC_CHANNELS.transfer.checkDownloadConflicts,
    async (_event, request: unknown): Promise<IpcResponse<TransferConflictCheckResponse>> => {
      try {
        const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:checkDownloadConflicts request.");
        const req = parseDownloadRequest(body);
        return ok({ conflicts: await checkDownloadConflicts(req) });
      } catch (error) {
        return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Failed to check download conflicts.");
      }
    }
  );

  registerChannel(
    IPC_CHANNELS.transfer.enqueueUpload,
    async (_event, request: unknown): Promise<IpcResponse<{ queued: true; taskIds: string[] }>> => {
      try {
        const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:enqueueUpload request.");
        const data = await transferQueueService.enqueueUpload(await prepareUploadForPolicy(parseUploadRequest(body)));
        return ok(data);
      } catch (error) {
        return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Unexpected transfer queue error.");
      }
    }
  );

  registerChannel(
    IPC_CHANNELS.transfer.enqueueDownload,
    async (_event, request: unknown): Promise<IpcResponse<{ queued: true; taskIds: string[] }>> => {
      try {
        const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:enqueueDownload request.");
        const data = await transferQueueService.enqueueDownload(await prepareDownloadForPolicy(parseDownloadRequest(body)));
        return ok(data);
      } catch (error) {
        return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Unexpected transfer queue error.");
      }
    }
  );

  registerChannel(IPC_CHANNELS.transfer.cancel, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:cancel request.");
      const taskId = requiredId(body.taskId, "taskId", "TRANSFER_INVALID_REQUEST");
      const data = await transferQueueService.cancel(taskId);
      return ok(data);
    } catch (error) {
      return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Unexpected transfer queue error.");
    }
  });

  registerChannel(IPC_CHANNELS.transfer.stop, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:stop request.");
      const taskId = requiredId(body.taskId, "taskId", "TRANSFER_INVALID_REQUEST");
      const data = await transferQueueService.stop(taskId);
      return ok(data);
    } catch (error) {
      return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Unexpected transfer queue error.");
    }
  });

  registerChannel(IPC_CHANNELS.transfer.retry, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:retry request.");
      const taskId = requiredId(body.taskId, "taskId", "TRANSFER_INVALID_REQUEST");
      const data = await transferQueueService.retry(taskId);
      return ok(data);
    } catch (error) {
      return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Unexpected transfer queue error.");
    }
  });

  registerChannel(IPC_CHANNELS.transfer.retryFailed, async () => {
    try {
      const data = await transferQueueService.retryFailed();
      return ok(data);
    } catch (error) {
      return toIpcError(error, "TRANSFER_QUEUE_ERROR", "Unexpected transfer queue error.");
    }
  });

  registerChannel(IPC_CHANNELS.transfer.list, (): IpcResponse<ReturnType<typeof transferQueueService.list>> => ok(transferQueueService.list()));

  registerChannel(
    IPC_CHANNELS.transfer.clearCompleted,
    (): IpcResponse<{ cleared: number }> => ok(transferQueueService.clearCompleted())
  );

  registerChannel(IPC_CHANNELS.settings.get, async () => {
    try {
      return ok(await settingsService.get());
    } catch (error) {
      return toIpcError(error, "SETTINGS_LOAD_FAILED", "Failed to load settings.");
    }
  });
  registerChannel(IPC_CHANNELS.settings.set, async (_event, request: unknown) => {
    try {
      return ok(await settingsService.set(request));
    } catch (error) {
      return toIpcError(error, "SETTINGS_SAVE_FAILED", "Failed to save settings.");
    }
  });

  registerChannel(IPC_CHANNELS.localFavorites.list, async (): Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>> => {
    try {
      const favorites = await localSidebarFavoritesRepository.listRows();
      return ok({ favorites });
    } catch (error) {
      return toIpcError(error, "LOCAL_FAVORITES_PERSIST_FAILED", "Failed to load local favorites.");
    }
  });

  registerChannel(IPC_CHANNELS.localFavorites.add, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid localFavorites:add request.");
      const targetPath = validateLocalPathInput(body.path, "LOCAL_INVALID_INPUT");
      const favorites = await localSidebarFavoritesRepository.addPath(targetPath);
      return ok({ favorites });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "LOCAL_FAVORITES_DUPLICATE"
      ) {
        return fail("LOCAL_FAVORITES_DUPLICATE", "This folder is already in favorites.");
      }
      return toIpcError(error, "LOCAL_FAVORITES_PERSIST_FAILED", "Failed to save favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.localFavorites.remove, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid localFavorites:remove request.");
      const id = requiredString(body.id, "id", "LOCAL_INVALID_INPUT");
      const favorites = await localSidebarFavoritesRepository.removeById(id);
      return ok({ favorites });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "LOCAL_FAVORITES_NOT_FOUND"
      ) {
        return fail("LOCAL_FAVORITES_NOT_FOUND", "Favorite not found.");
      }
      return toIpcError(error, "LOCAL_FAVORITES_PERSIST_FAILED", "Failed to remove favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.localFavorites.rename, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid localFavorites:rename request.");
      const id = requiredString(body.id, "id", "LOCAL_INVALID_INPUT");
      const label = requiredString(body.label, "label", "LOCAL_INVALID_INPUT", undefined, { maxLength: 256 });
      const favorites = await localSidebarFavoritesRepository.renameById(id, label);
      return ok({ favorites });
    } catch (error) {
      return toIpcError(error, "LOCAL_FAVORITES_PERSIST_FAILED", "Failed to rename favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.localFavorites.reorder, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "LOCAL_INVALID_INPUT", "Invalid localFavorites:reorder request.");
      const id = requiredString(body.id, "id", "LOCAL_INVALID_INPUT");
      const direction = body.direction === "up" ? "up" : body.direction === "down" ? "down" : null;
      if (!direction) throw new AppError("LOCAL_INVALID_INPUT", "Direction must be up or down.");
      const favorites = await localSidebarFavoritesRepository.reorderById(id, direction);
      return ok({ favorites });
    } catch (error) {
      return toIpcError(error, "LOCAL_FAVORITES_PERSIST_FAILED", "Failed to reorder favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.localFavorites.resetDefaults, async (): Promise<IpcResponse<{ favorites: LocalFavoriteListItem[] }>> => {
    try {
      const favorites = await localSidebarFavoritesRepository.resetDefaultLocations();
      return ok({ favorites });
    } catch (error) {
      return toIpcError(error, "LOCAL_FAVORITES_PERSIST_FAILED", "Failed to reset default favorites.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.list, async (): Promise<IpcResponse<ServerProfile[]>> => {
    try {
      const data = await listProfilesWithCredentialFlags();
      return ok(data);
    } catch (error) {
      return toIpcError(error, "PROFILE_LOAD_FAILED", "Failed to load saved sites.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.save, async (_event, body: unknown) => {
    try {
      const data = await upsertProfile(validateProfileUpsertPayload(body));
      return ok(data);
    } catch (error) {
      return toIpcError(error, "PROFILE_SAVE_FAILED", "Unexpected profile save error.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.update, async (_event, body: unknown) => {
    try {
      const data = await upsertProfile(validateProfileUpsertPayload(body));
      return ok(data);
    } catch (error) {
      return toIpcError(error, "PROFILE_SAVE_FAILED", "Unexpected profile save error.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.delete, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "PROFILE_INVALID", "Invalid profiles:delete request.");
      await deleteProfileById(requiredId(body.id, "id", "PROFILE_INVALID"));
      return ok({ deleted: true as const });
    } catch (error) {
      return toIpcError(error, "PROFILE_DELETE_FAILED", "Failed to delete profile.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.addRemoteFavorite, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "PROFILE_INVALID", "Invalid profiles:addRemoteFavorite request.");
      const profileId = requiredId(body.profileId, "profileId", "PROFILE_INVALID");
      const remotePath = normalizeRemotePathInput(body.path, "PROFILE_INVALID", "path");
      return ok(await addRemoteFavorite(profileId, remotePath));
    } catch (error) {
      return toIpcError(error, "PROFILE_SAVE_FAILED", "Failed to add remote favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.removeRemoteFavorite, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "PROFILE_INVALID", "Invalid profiles:removeRemoteFavorite request.");
      const profileId = requiredId(body.profileId, "profileId", "PROFILE_INVALID");
      const favoriteId = requiredId(body.favoriteId, "favoriteId", "PROFILE_INVALID");
      return ok(await removeRemoteFavorite(profileId, favoriteId));
    } catch (error) {
      return toIpcError(error, "PROFILE_SAVE_FAILED", "Failed to remove remote favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.renameRemoteFavorite, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "PROFILE_INVALID", "Invalid profiles:renameRemoteFavorite request.");
      const profileId = requiredId(body.profileId, "profileId", "PROFILE_INVALID");
      const favoriteId = requiredId(body.favoriteId, "favoriteId", "PROFILE_INVALID");
      const label = requiredString(body.label, "label", "PROFILE_INVALID", undefined, { maxLength: 256 });
      return ok(await renameRemoteFavorite(profileId, favoriteId, label));
    } catch (error) {
      return toIpcError(error, "PROFILE_SAVE_FAILED", "Failed to rename remote favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.profiles.reorderRemoteFavorite, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "PROFILE_INVALID", "Invalid profiles:reorderRemoteFavorite request.");
      const profileId = requiredId(body.profileId, "profileId", "PROFILE_INVALID");
      const favoriteId = requiredId(body.favoriteId, "favoriteId", "PROFILE_INVALID");
      const direction = body.direction === "up" ? "up" : body.direction === "down" ? "down" : null;
      if (!direction) throw new AppError("PROFILE_INVALID", "Direction must be up or down.");
      return ok(await reorderRemoteFavorite(profileId, favoriteId, direction));
    } catch (error) {
      return toIpcError(error, "PROFILE_SAVE_FAILED", "Failed to reorder remote favorite.");
    }
  });

  registerChannel(IPC_CHANNELS.credentials.isAvailable, (): IpcResponse<{ available: boolean }> => {
    return ok({ available: credentialService.isStorageAvailable() });
  });

  registerChannel(IPC_CHANNELS.system.copyText, (_event, request: unknown) => {
    try {
      const body = asRecord(request, "SYSTEM_INVALID_INPUT", "Invalid system:copyText request.");
      const text = requiredString(body.text, "text", "SYSTEM_INVALID_INPUT");
      clipboard.writeText(text);
      return ok({ copied: true as const });
    } catch (error) {
      return toIpcError(error, "SYSTEM_INVALID_INPUT", "Failed to copy text.");
    }
  });

  registerChannel(IPC_CHANNELS.system.quickLook, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "SYSTEM_INVALID_INPUT", "Invalid system:quickLook request.");
      const targetPath = validateLocalPathInput(body.path, "SYSTEM_INVALID_INPUT");
      await quickLookService.previewLocalPath(targetPath);
      return ok({ opened: true as const });
    } catch (error) {
      return toIpcError(error, "SYSTEM_PREVIEW_FAILED", "Failed to open Quick Look preview.");
    }
  });

  registerChannel(IPC_CHANNELS.system.openTerminal, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "SYSTEM_INVALID_INPUT", "Invalid system:openTerminal request.");
      const targetPath = validateLocalPathInput(body.path, "SYSTEM_INVALID_INPUT");
      await runDetached("open", ["-a", "Terminal", targetPath]);
      return ok({ opened: true as const });
    } catch (error) {
      return toIpcError(error, "SYSTEM_INVALID_INPUT", "Failed to open Terminal.");
    }
  });

  registerChannel(IPC_CHANNELS.system.openSshTerminal, async (_event, request: unknown) => {
    try {
      const body = asRecord(request, "SYSTEM_INVALID_INPUT", "Invalid system:openSshTerminal request.");
      const host = requiredHost(body.host, "SYSTEM_INVALID_INPUT");
      const username = requiredUsername(body.username, "SYSTEM_INVALID_INPUT");
      const port = requiredPort(body.port, "SYSTEM_INVALID_INPUT");
      const remotePath = optionalString(body.remotePath) ? normalizeRemotePathInput(body.remotePath, "SYSTEM_INVALID_INPUT", "remotePath") : undefined;
      const command = buildSshTerminalCommand(username, host, port, remotePath);
      await runDetached("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(command)}`]);
      return ok({ opened: true as const });
    } catch (error) {
      return toIpcError(error, "SYSTEM_INVALID_INPUT", "Failed to open SSH terminal.");
    }
  });

  registerChannel(IPC_CHANNELS.system.getAppVersion, () => {
    try {
      return ok({ version: app.getVersion() });
    } catch (error) {
      return toIpcError(error, "SYSTEM_VERSION_FAILED", "Failed to resolve app version.");
    }
  });

  registerChannel(IPC_CHANNELS.system.openLogFolder, async () => {
    try {
      await fs.mkdir(userData, { recursive: true });
      const error = await shell.openPath(userData);
      if (error) throw new AppError("SYSTEM_LOG_OPEN_FAILED", error);
      return ok({ opened: true as const, path: userData });
    } catch (error) {
      return toIpcError(error, "SYSTEM_LOG_OPEN_FAILED", "Failed to open log folder.");
    }
  });

  registerChannel(IPC_CHANNELS.system.openLogFile, async () => {
    try {
      await fs.mkdir(userData, { recursive: true });
      await fs.appendFile(mainLogFilePath, "");
      const error = await shell.openPath(mainLogFilePath);
      if (error) throw new AppError("SYSTEM_LOG_OPEN_FAILED", error);
      return ok({ opened: true as const, path: mainLogFilePath });
    } catch (error) {
      return toIpcError(error, "SYSTEM_LOG_OPEN_FAILED", "Failed to open log file.");
    }
  });

  registerChannel(IPC_CHANNELS.system.copyDiagnostics, async () => {
    try {
      const text = await diagnosticsService.buildClipboardText();
      const diagnostics = await diagnosticsService.buildBundle();
      clipboard.writeText(text);
      return ok({ copied: true as const, diagnostics });
    } catch (error) {
      return toIpcError(error, "SYSTEM_DIAGNOSTICS_FAILED", "Failed to copy diagnostics.");
    }
  });

  registerChannel(IPC_CHANNELS.system.checkForUpdates, () => {
    return ok({
      available: false as const,
      message: "Auto-update install is not enabled in this build. Use the documented release checklist and GitHub Releases artifacts."
    });
  });
}

function sendRemoteDirectorySizeUpdate(payload: RemoteDirectorySizeUpdatePayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.remote.directorySizeUpdate, payload);
  }
}

async function runDetached(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function buildSshTerminalCommand(username: string, host: string, port: number, remotePath?: string): string {
  const base = `ssh -p ${port} ${username}@${host}`;
  if (!remotePath) return base;
  return `${base} -t ${shellSingleQuote(`cd ${remotePath} && exec "$SHELL" -l`)}`;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function shutdownMainProcessResources(): Promise<void> {
  transferOff?.();
  transferOff = null;
  for (const controller of remoteSizeJobs.values()) controller.abort();
  remoteSizeJobs.clear();
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredChannels.length = 0;
  isRegistered = false;
  await transferQueueService.shutdown();
  await remotePreviewService.clearAll();
  await connectionManager.disconnectAll();
}

async function listProfilesWithCredentialFlags(): Promise<ServerProfile[]> {
  const list = await profileRepository.loadAll();
  const enriched: ServerProfile[] = [];
  for (const profile of list) {
    const hasSavedPassword = credentialService.isStorageAvailable() ? await credentialService.has(profile.id) : false;
    enriched.push({ ...profile, hasSavedPassword });
  }
  return enriched;
}

async function upsertProfile(body: ProfileUpsertPayload): Promise<ServerProfile> {
  const now = Date.now();
  const id = body.id?.trim() ? body.id.trim() : randomUUID();
  const existingList = await profileRepository.loadAll();
  const existing = existingList.find((p) => p.id === id);

  const profile: ServerProfile = {
    id,
    alias: body.alias.trim(),
    host: body.host.trim(),
    port: body.port,
    username: body.username.trim(),
    defaultRemotePath: body.defaultRemotePath?.trim() || undefined,
    remoteFavorites: existing?.remoteFavorites,
    authType: body.authType,
    privateKeyPath: body.privateKeyPath?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  if (body.savePassword && !credentialService.isStorageAvailable()) {
    const err = new Error("Password saving requires system encryption, which is not available.");
    (err as Error & { code?: string }).code = "CREDENTIAL_UNAVAILABLE";
    throw err;
  }

  await profileRepository.upsert(profile);

  try {
    if (!body.savePassword) {
      await credentialService.delete(id);
    } else {
      const pwd = body.password?.trim() ?? "";
      if (pwd) {
        await credentialService.set(id, pwd);
      }
    }
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    const err = new Error(code === "CREDENTIAL_UNAVAILABLE" ? "Cannot save password on this system." : "Failed to save credentials.");
    (err as Error & { code?: string }).code =
      code === "CREDENTIAL_UNAVAILABLE" ? "CREDENTIAL_UNAVAILABLE" : "CREDENTIAL_SAVE_FAILED";
    throw err;
  }

  const hasSavedPassword = await credentialService.has(id);
  return { ...profile, hasSavedPassword };
}

async function addRemoteFavorite(profileId: string, remotePath: string): Promise<ServerProfile> {
  const profile = await getProfileOrThrow(profileId);
  const current = profile.remoteFavorites ?? [];
  if (current.some((f) => f.path === remotePath)) return profile;
  const label = remoteFavoriteLabel(remotePath);
  return profileRepository.updateRemoteFavorites(profileId, [
    ...current,
    { id: randomUUID(), label, path: remotePath, createdAt: Date.now() }
  ]);
}

async function removeRemoteFavorite(profileId: string, favoriteId: string): Promise<ServerProfile> {
  const profile = await getProfileOrThrow(profileId);
  const next = (profile.remoteFavorites ?? []).filter((f) => f.id !== favoriteId);
  return profileRepository.updateRemoteFavorites(profileId, next);
}

async function renameRemoteFavorite(profileId: string, favoriteId: string, label: string): Promise<ServerProfile> {
  const profile = await getProfileOrThrow(profileId);
  const next = (profile.remoteFavorites ?? []).map((f) => (f.id === favoriteId ? { ...f, label: label.trim() } : f));
  return profileRepository.updateRemoteFavorites(profileId, next);
}

async function reorderRemoteFavorite(profileId: string, favoriteId: string, direction: "up" | "down"): Promise<ServerProfile> {
  const profile = await getProfileOrThrow(profileId);
  const next = [...(profile.remoteFavorites ?? [])];
  const index = next.findIndex((f) => f.id === favoriteId);
  if (index < 0) return profile;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= next.length) return profile;
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return profileRepository.updateRemoteFavorites(profileId, next);
}

async function getProfileOrThrow(profileId: string): Promise<ServerProfile> {
  const profile = (await profileRepository.loadAll()).find((p) => p.id === profileId);
  if (!profile) throw new AppError("PROFILE_INVALID", "Profile not found.");
  return profile;
}

function remoteFavoriteLabel(remotePath: string): string {
  const normalized = remotePath.replace(/\/+$/, "") || "/";
  if (normalized === "/") return "/";
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

async function deleteProfileById(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) {
    const err = new Error("Profile id is required.");
    (err as Error & { code?: string }).code = "PROFILE_INVALID";
    throw err;
  }
  const existing = await profileRepository.loadAll();
  if (!existing.some((p) => p.id === trimmed)) {
    const err = new Error("Profile not found.");
    (err as Error & { code?: string }).code = "PROFILE_INVALID";
    throw err;
  }
  try {
    await credentialService.delete(trimmed);
  } catch {
    const err = new Error("Failed to delete saved password.");
    (err as Error & { code?: string }).code = "CREDENTIAL_DELETE_FAILED";
    throw err;
  }
  await profileRepository.delete(trimmed);
}

function validateProfileUpsertPayload(input: unknown): ProfileUpsertPayload {
  const body = asRecord(input, "PROFILE_INVALID", "Invalid profile payload.");
  return {
    id: optionalString(body.id),
    alias: optionalString(body.alias) ?? "",
    host: requiredHost(body.host, "PROFILE_INVALID"),
    port: requiredPort(body.port, "PROFILE_INVALID"),
    username: requiredUsername(body.username, "PROFILE_INVALID"),
    defaultRemotePath: optionalString(body.defaultRemotePath),
    authType: body.authType === "privateKey" ? "privateKey" : "password",
    privateKeyPath: optionalString(body.privateKeyPath),
    password: optionalString(body.password),
    savePassword: Boolean(body.savePassword)
  };
}

function parseUploadRequest(body: Record<string, unknown>): EnqueueUploadRequest {
  return {
    tabId: requiredId(body.tabId, "tabId", "TRANSFER_INVALID_REQUEST"),
    profileId: optionalString(body.profileId),
    connectionId: optionalString(body.connectionId),
    host: requiredHost(body.host, "TRANSFER_INVALID_REQUEST"),
    port: requiredPort(body.port, "TRANSFER_INVALID_REQUEST"),
    username: requiredUsername(body.username, "TRANSFER_INVALID_REQUEST"),
    authType: body.authType === "privateKey" ? "privateKey" : "password",
    localSources: Array.isArray(body.localSources) ? body.localSources.map((v) => validateLocalPathInput(v, "TRANSFER_INVALID_REQUEST")) : [],
    remoteDestinationDir: normalizeRemotePathInput(body.remoteDestinationDir, "TRANSFER_INVALID_REQUEST"),
    conflictPolicy: parseConflictPolicy(body.conflictPolicy),
    preserveTimestamps: optionalBoolean(body.preserveTimestamps),
    remoteTargetOverrides: parseStringMap(body.remoteTargetOverrides, "remoteTargetOverrides")
  };
}

function parseDownloadRequest(body: Record<string, unknown>): EnqueueDownloadRequest {
  return {
    tabId: requiredId(body.tabId, "tabId", "TRANSFER_INVALID_REQUEST"),
    profileId: optionalString(body.profileId),
    connectionId: optionalString(body.connectionId),
    host: requiredHost(body.host, "TRANSFER_INVALID_REQUEST"),
    port: requiredPort(body.port, "TRANSFER_INVALID_REQUEST"),
    username: requiredUsername(body.username, "TRANSFER_INVALID_REQUEST"),
    authType: body.authType === "privateKey" ? "privateKey" : "password",
    remoteSources: Array.isArray(body.remoteSources)
      ? body.remoteSources.map((v) => normalizeRemotePathInput(v, "TRANSFER_INVALID_REQUEST"))
      : [],
    localDestinationDir: validateLocalPathInput(body.localDestinationDir, "TRANSFER_INVALID_REQUEST"),
    conflictPolicy: parseConflictPolicy(body.conflictPolicy),
    preserveTimestamps: optionalBoolean(body.preserveTimestamps),
    localTargetOverrides: parseStringMap(body.localTargetOverrides, "localTargetOverrides")
  };
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseConflictPolicy(value: unknown): EnqueueUploadRequest["conflictPolicy"] {
  if (value === "overwrite" || value === "skip" || value === "rename" || value === "cancel" || value === "prompt") return value;
  return "prompt";
}

function parseStringMap(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("TRANSFER_INVALID_REQUEST", `${field} must be an object.`);
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw;
  }
  return out;
}

async function checkUploadConflicts(request: EnqueueUploadRequest): Promise<TransferConflict[]> {
  if (!request.connectionId) throw new AppError("TRANSFER_INVALID_REQUEST", "Connection id is required for upload conflict checks.");
  const connection = connectionManager.getConnection(request.connectionId);
  if (!connection) throw new AppError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
  const client = connection.client as unknown as { stat: (remotePath: string) => Promise<{ type?: string | number }> };
  const conflicts: TransferConflict[] = [];
  for (const source of request.localSources) {
    const target = normalizeRemotePathInput(
      request.remoteTargetOverrides?.[source] ?? path.posix.join(request.remoteDestinationDir, path.basename(source)),
      "TRANSFER_INVALID_REQUEST"
    );
    try {
      const stat = await client.stat(target);
      conflicts.push({ source, target, targetType: remoteStatType(stat.type) });
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }
  return conflicts;
}

async function checkDownloadConflicts(request: EnqueueDownloadRequest): Promise<TransferConflict[]> {
  const conflicts: TransferConflict[] = [];
  for (const source of request.remoteSources) {
    const target = validateLocalPathInput(
      request.localTargetOverrides?.[source] ?? path.join(request.localDestinationDir, path.posix.basename(source)),
      "TRANSFER_INVALID_REQUEST"
    );
    try {
      const stat = await fs.lstat(target);
      conflicts.push({ source, target, targetType: localStatType(stat) });
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }
  return conflicts;
}

async function prepareUploadForPolicy(request: EnqueueUploadRequest): Promise<EnqueueUploadRequest> {
  const policy = request.conflictPolicy ?? "prompt";
  if (policy === "cancel") throw new AppError("TRANSFER_INVALID_REQUEST", "Transfer canceled.");
  if (policy === "overwrite") return request;
  const conflicts = await checkUploadConflicts(request);
  if (conflicts.length === 0) return request;
  if (policy === "prompt") throw new AppError("TRANSFER_CONFLICT", "Destination already exists. Choose how to resolve the conflict.");
  const conflictSources = new Set(conflicts.map((c) => c.source));
  if (policy === "skip") {
    return { ...request, localSources: request.localSources.filter((source) => !conflictSources.has(source)) };
  }
  const remoteTargetOverrides = { ...(request.remoteTargetOverrides ?? {}) };
  for (const conflict of conflicts) {
    remoteTargetOverrides[conflict.source] = await nextAvailableRemotePath(request.connectionId!, conflict.target);
  }
  return { ...request, remoteTargetOverrides };
}

async function prepareDownloadForPolicy(request: EnqueueDownloadRequest): Promise<EnqueueDownloadRequest> {
  const policy = request.conflictPolicy ?? "prompt";
  if (policy === "cancel") throw new AppError("TRANSFER_INVALID_REQUEST", "Transfer canceled.");
  if (policy === "overwrite") return request;
  const conflicts = await checkDownloadConflicts(request);
  if (conflicts.length === 0) return request;
  if (policy === "prompt") throw new AppError("TRANSFER_CONFLICT", "Destination already exists. Choose how to resolve the conflict.");
  const conflictSources = new Set(conflicts.map((c) => c.source));
  if (policy === "skip") {
    return { ...request, remoteSources: request.remoteSources.filter((source) => !conflictSources.has(source)) };
  }
  const localTargetOverrides = { ...(request.localTargetOverrides ?? {}) };
  for (const conflict of conflicts) {
    localTargetOverrides[conflict.source] = await nextAvailableLocalPath(conflict.target);
  }
  return { ...request, localTargetOverrides };
}

async function nextAvailableRemotePath(connectionId: string, target: string): Promise<string> {
  const connection = connectionManager.getConnection(connectionId);
  if (!connection) throw new AppError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
  const client = connection.client as unknown as { stat: (remotePath: string) => Promise<unknown> };
  const parsed = path.posix.parse(target);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = path.posix.join(parsed.dir, `${parsed.name} copy${i === 1 ? "" : ` ${i}`}${parsed.ext}`);
    try {
      await client.stat(candidate);
    } catch (error) {
      if (isMissingPathError(error)) return candidate;
      throw error;
    }
  }
  throw new AppError("TRANSFER_INVALID_REQUEST", "Could not find available remote name.");
}

async function nextAvailableLocalPath(target: string): Promise<string> {
  const parsed = path.parse(target);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name} copy${i === 1 ? "" : ` ${i}`}${parsed.ext}`);
    try {
      await fs.lstat(candidate);
    } catch (error) {
      if (isMissingPathError(error)) return candidate;
      throw error;
    }
  }
  throw new AppError("TRANSFER_INVALID_REQUEST", "Could not find available local name.");
}

function isMissingPathError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "";
  return code === "ENOENT" || /No such file|no such path|does not exist|ENOENT/i.test(message);
}

function remoteStatType(type: unknown): EntryType {
  if (type === "d" || type === "directory" || type === 2) return "directory";
  if (type === "l" || type === "symlink") return "symlink";
  if (type === "-" || type === "file" || type === 1) return "file";
  return "unknown";
}

function localStatType(stat: { isDirectory: () => boolean; isFile: () => boolean; isSymbolicLink: () => boolean }): EntryType {
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  if (stat.isSymbolicLink()) return "symlink";
  return "unknown";
}
