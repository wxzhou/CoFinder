import { app, BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { IPC_CHANNELS } from "./channels";
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
  IpcFailureResponse,
  IpcResponse,
  LocalErrorPayload,
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

transferQueueService.onUpdate((payload: TransferUpdatePayload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.transfer.onUpdate, payload);
  }
});

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
        let password = request.password?.trim() ?? "";
        if (!password && request.profileId) {
          password = (await credentialService.get(request.profileId))?.trim() ?? "";
        }
        const data = await remoteFileService.connect({
          host: request.host,
          port: request.port,
          username: request.username,
          password,
          profileId: request.profileId,
          defaultRemotePath: request.defaultRemotePath,
          privateKeyPath: request.privateKeyPath,
          authType: request.authType
        });
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
    async (_event, request: EnqueueUploadRequest): Promise<IpcResponse<{ queued: true; taskIds: string[] }>> => {
      try {
        const data = await transferQueueService.enqueueUpload(request);
        return { ok: true, data };
      } catch (error) {
        return toTransferIpcError(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.transfer.enqueueDownload,
    async (_event, request: EnqueueDownloadRequest): Promise<IpcResponse<{ queued: true; taskIds: string[] }>> => {
      try {
        const data = await transferQueueService.enqueueDownload(request);
        return { ok: true, data };
      } catch (error) {
        return toTransferIpcError(error);
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.transfer.cancel, async (_event, request: { taskId: string }) => {
    try {
      const data = await transferQueueService.cancel(request.taskId);
      return { ok: true, data };
    } catch (error) {
      return toTransferIpcError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.transfer.stop, async (_event, request: { taskId: string }) => {
    try {
      const data = await transferQueueService.stop(request.taskId);
      return { ok: true, data };
    } catch (error) {
      return toTransferIpcError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.transfer.list, (): IpcResponse<ReturnType<typeof transferQueueService.list>> => ({
    ok: true,
    data: transferQueueService.list()
  }));

  ipcMain.handle(
    IPC_CHANNELS.transfer.clearCompleted,
    (): IpcResponse<{ cleared: number }> => ({ ok: true, data: transferQueueService.clearCompleted() })
  );

  ipcMain.handle(IPC_CHANNELS.settings.get, () => settingsService.get());
  ipcMain.handle(IPC_CHANNELS.settings.set, (_event, request: Record<string, unknown>) => settingsService.set(request));

  ipcMain.handle(IPC_CHANNELS.profiles.list, async (): Promise<IpcResponse<ServerProfile[]>> => {
    try {
      const data = await listProfilesWithCredentialFlags();
      return { ok: true, data };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "PROFILE_LOAD_FAILED",
          message: "Failed to load saved sites.",
          detail: error instanceof Error ? error.message : undefined
        }
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.profiles.save, async (_event, body: ProfileUpsertPayload) => {
    try {
      const data = await upsertProfile(body);
      return { ok: true, data };
    } catch (error) {
      return toProfileCredentialIpcError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.profiles.update, async (_event, body: ProfileUpsertPayload) => {
    try {
      const data = await upsertProfile(body);
      return { ok: true, data };
    } catch (error) {
      return toProfileCredentialIpcError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.profiles.delete, async (_event, request: { id: string }) => {
    try {
      await deleteProfileById(request.id);
      return { ok: true, data: { deleted: true as const } };
    } catch (error) {
      return toProfileCredentialIpcError(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.credentials.isAvailable, (): IpcResponse<{ available: boolean }> => {
    return { ok: true, data: { available: credentialService.isStorageAvailable() } };
  });
}

export async function disconnectAllRemoteConnections(): Promise<void> {
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
  validateProfileUpsert(body);
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

function validateProfileUpsert(body: ProfileUpsertPayload): void {
  if (!body.host?.trim()) {
    const err = new Error("Host is required.");
    (err as Error & { code?: string }).code = "PROFILE_INVALID";
    throw err;
  }
  if (!body.username?.trim()) {
    const err = new Error("Username is required.");
    (err as Error & { code?: string }).code = "PROFILE_INVALID";
    throw err;
  }
  if (!Number.isInteger(body.port) || body.port <= 0 || body.port > 65535) {
    const err = new Error("Port must be between 1 and 65535.");
    (err as Error & { code?: string }).code = "PROFILE_INVALID";
    throw err;
  }
}

function toProfileCredentialIpcError(error: unknown): IpcFailureResponse {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const code = String((error as { code: unknown }).code);
    const message = String((error as { message: unknown }).message);
    const detail = "detail" in error ? String((error as { detail?: unknown }).detail) : undefined;
    const mapped =
      code === "CREDENTIAL_UNAVAILABLE"
        ? "CREDENTIAL_UNAVAILABLE"
        : code === "CREDENTIAL_SAVE_FAILED"
          ? "CREDENTIAL_SAVE_FAILED"
          : code === "CREDENTIAL_DELETE_FAILED"
            ? "CREDENTIAL_DELETE_FAILED"
            : code === "PROFILE_INVALID"
              ? "PROFILE_INVALID"
              : "PROFILE_SAVE_FAILED";
    return {
      ok: false,
      error: {
        code: mapped,
        message,
        detail
      }
    };
  }
  return {
    ok: false,
    error: { code: "PROFILE_SAVE_FAILED", message: "Unexpected profile save error." }
  };
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
        detail: "detail" in error ? String((error as { detail?: unknown }).detail) : undefined
      }
    };
  }
  return base;
}

function toTransferIpcError(error: unknown): IpcFailureResponse {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const code = String((error as { code: unknown }).code);
    const mapped =
      code === "TRANSFER_INVALID_REQUEST"
        ? "TRANSFER_INVALID_REQUEST"
        : code === "TRANSFER_PRECHECK_FAILED"
          ? "TRANSFER_PRECHECK_FAILED"
          : code === "TRANSFER_NOT_FOUND"
            ? "TRANSFER_NOT_FOUND"
            : code === "TRANSFER_NOT_RUNNING"
              ? "TRANSFER_NOT_RUNNING"
              : "TRANSFER_QUEUE_ERROR";
    return {
      ok: false,
      error: {
        code: mapped,
        message: String((error as { message: unknown }).message),
        detail: "detail" in error ? String((error as { detail?: unknown }).detail) : undefined
      }
    };
  }
  return {
    ok: false,
    error: {
      code: "TRANSFER_QUEUE_ERROR",
      message: "Unexpected transfer queue error."
    }
  };
}
