import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
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
import { SettingsService } from "../services/SettingsService";
import { ConnectionManager } from "../services/ConnectionManager";
import { CredentialService } from "../services/CredentialService";
import { ProfileRepository, defaultCredentialsPath, defaultProfilesPath } from "../services/ProfileRepository";
import { SafeStorageCredentialProvider } from "../services/SafeStorageCredentialProvider";
import type {
  EnqueueDownloadRequest,
  EnqueueUploadRequest,
  IpcResponse,
  ProfileUpsertPayload,
  RemoteConnectRequest,
  RemoteConnectResponse,
  TransferUpdatePayload,
  RemoteListDirectoryRequest,
  RemoteListDirectoryResponse
} from "../../shared/types/ipc";
import type { ServerProfile } from "../../shared/types/models";

const localFileService = new LocalFileService();
const connectionManager = new ConnectionManager();
const remoteFileService = new RemoteFileService(connectionManager);
const transferQueueService = new TransferQueueService();
const settingsService = new SettingsService();

const userData = app.getPath("userData");
const profileRepository = new ProfileRepository(defaultProfilesPath(userData));
const credentialProvider = new SafeStorageCredentialProvider(defaultCredentialsPath(userData));
const credentialService = new CredentialService(credentialProvider);
const registeredChannels: string[] = [];
let transferOff: (() => void) | null = null;
let isRegistered = false;

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

  registerChannel(
    IPC_CHANNELS.transfer.enqueueUpload,
    async (_event, request: unknown): Promise<IpcResponse<{ queued: true; taskIds: string[] }>> => {
      try {
        const body = asRecord(request, "TRANSFER_INVALID_REQUEST", "Invalid transfer:enqueueUpload request.");
        const data = await transferQueueService.enqueueUpload({
          tabId: requiredId(body.tabId, "tabId", "TRANSFER_INVALID_REQUEST"),
          profileId: optionalString(body.profileId),
          connectionId: optionalString(body.connectionId),
          host: requiredHost(body.host, "TRANSFER_INVALID_REQUEST"),
          port: requiredPort(body.port, "TRANSFER_INVALID_REQUEST"),
          username: requiredUsername(body.username, "TRANSFER_INVALID_REQUEST"),
          authType: body.authType === "privateKey" ? "privateKey" : "password",
          localSources: Array.isArray(body.localSources) ? body.localSources.map((v) => String(v)) : [],
          remoteDestinationDir: normalizeRemotePathInput(body.remoteDestinationDir, "TRANSFER_INVALID_REQUEST")
        });
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
        const data = await transferQueueService.enqueueDownload({
          tabId: requiredId(body.tabId, "tabId", "TRANSFER_INVALID_REQUEST"),
          profileId: optionalString(body.profileId),
          connectionId: optionalString(body.connectionId),
          host: requiredHost(body.host, "TRANSFER_INVALID_REQUEST"),
          port: requiredPort(body.port, "TRANSFER_INVALID_REQUEST"),
          username: requiredUsername(body.username, "TRANSFER_INVALID_REQUEST"),
          authType: body.authType === "privateKey" ? "privateKey" : "password",
          remoteSources: Array.isArray(body.remoteSources) ? body.remoteSources.map((v) => String(v)) : [],
          localDestinationDir: validateLocalPathInput(body.localDestinationDir, "TRANSFER_INVALID_REQUEST")
        });
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

  registerChannel(IPC_CHANNELS.transfer.list, (): IpcResponse<ReturnType<typeof transferQueueService.list>> => ok(transferQueueService.list()));

  registerChannel(
    IPC_CHANNELS.transfer.clearCompleted,
    (): IpcResponse<{ cleared: number }> => ok(transferQueueService.clearCompleted())
  );

  registerChannel(IPC_CHANNELS.settings.get, () => settingsService.get());
  registerChannel(IPC_CHANNELS.settings.set, (_event, request: Record<string, unknown>) => settingsService.set(request));

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
}

export async function shutdownMainProcessResources(): Promise<void> {
  transferOff?.();
  transferOff = null;
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredChannels.length = 0;
  isRegistered = false;
  await transferQueueService.shutdown();
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
