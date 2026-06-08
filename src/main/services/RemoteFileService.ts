import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConnectionConfig, RemoteFileEntry } from "../../shared/types/models";
import type { PathInfo, RemoteConnectResponse, RemoteErrorCode, RemoteListDirectoryResponse, TextContentReadResponse, TextSearchResponse } from "../../shared/types/ipc";
import { timestampInputToTouchStamp } from "../../shared/timestampInput";
import { ConnectionManager } from "./ConnectionManager";
import { isSafeHostOrUsername, normalizeRemotePosixPath } from "../utils/pathSafety";
import { modeToRwx, rightsToRwx } from "./permissionDisplay";
import { sniffPreviewKind } from "./RemotePreviewService";

const posixPath = path.posix;
const DEFAULT_TEXT_READ_BYTES = 256 * 1024;
const TEXT_SNIFF_BYTES = 8192;
const DEFAULT_TEXT_SEARCH_MATCHES = 200;
const REMOTE_SEARCH_TOOL_MARKER = "__COFINDER_SEARCH_TOOL__:";
type RemoteListItem = {
  name: string;
  type: string;
  size: number;
  modifyTime: number;
  rights?: { user: string; group: string; other: string };
  owner?: number | string;
  group?: number | string;
};
type RemoteStatItem = {
  type: string | number;
  size?: number;
  modifyTime?: number;
  rights?: { user: string; group: string; other: string };
  owner?: number | string;
  group?: number | string;
  mode?: number;
};
type RemoteCompressClient = {
  stat: (path: string) => Promise<RemoteStatItem>;
  client?: {
    exec?: (command: string, callback: (error: Error | undefined, stream: unknown) => void) => void;
  };
};
type RemoteCommandClient = {
  client?: {
    exec?: (command: string, callback: (error: Error | undefined, stream: unknown) => void) => void;
  };
};
type RemoteCopyMoveClient = {
  stat: (path: string) => Promise<RemoteStatItem>;
  client?: {
    exec?: (command: string, callback: (error: Error | undefined, stream: unknown) => void) => void;
  };
};
type RemoteContentClient = {
  stat: (path: string) => Promise<RemoteStatItem>;
  get?: (remotePath: string, localPath?: string) => Promise<unknown>;
  client?: {
    exec?: (command: string, callback: (error: Error | undefined, stream: unknown) => void) => void;
  };
};
type RemoteDownloadClient = {
  stat: (path: string) => Promise<RemoteStatItem>;
  list: (path: string) => Promise<RemoteListItem[]>;
  fastGet?: (remotePath: string, localPath: string) => Promise<unknown>;
  get?: (remotePath: string, localPath?: string) => Promise<unknown>;
};
type RemoteUploadClient = {
  mkdir: (path: string, recursive?: boolean) => Promise<unknown>;
  fastPut?: (localPath: string, remotePath: string) => Promise<unknown>;
  put?: (input: Buffer | NodeJS.ReadableStream | string, path: string) => Promise<unknown>;
};

export type RemoteDirectorySizeOptions = {
  signal?: AbortSignal;
  maxEntries?: number;
  maxDepth?: number;
};

export type RemoteDirectorySizeResult = {
  size: number;
  visitedEntries: number;
  capped: boolean;
};

class RemoteServiceError extends Error {
  constructor(
    public readonly code: RemoteErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "RemoteServiceError";
  }
}

export class RemoteFileService {
  private readonly ownerNameCache = new WeakMap<object, Map<string, string>>();

  constructor(private readonly connectionManager: ConnectionManager) {}

  async connect(config: ConnectionConfig): Promise<RemoteConnectResponse> {
    if (!config.host.trim()) throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Host is required.");
    if (!config.username.trim()) throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Username is required.");
    if (!isSafeHostOrUsername(config.host.trim())) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Host contains unsupported characters.");
    }
    if (!isSafeHostOrUsername(config.username.trim())) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Username contains unsupported characters.");
    }
    if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Port must be between 1 and 65535.");
    }
    if (config.authType === "privateKey") {
      throw new RemoteServiceError(
        "REMOTE_INVALID_INPUT",
        "Private key authentication is not supported in this version."
      );
    }
    if (!config.password?.trim()) throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Password is required.");

    try {
      const connection = await this.connectionManager.createConnection(config);
      return {
        connectionId: connection.id,
        homePath: connection.homePath
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async listDirectory(connectionId: string, inputPath: string): Promise<RemoteListDirectoryResponse> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");

    const requestedPath = inputPath || connection.homePath;
    const normalizedPath = this.normalizeRemotePath(requestedPath);
    this.log("remote:listDirectory requested", {
      connectionId,
      requestedPath,
      normalizedPath,
      listAttempted: false
    });

    try {
      this.log("remote:listDirectory attempting list", {
        connectionId,
        normalizedPath,
        listAttempted: true
      });
      const entries = (await withTimeout(
        connection.client.list(normalizedPath),
        15_000,
        "Remote connection did not respond. Please reconnect."
      )) as RemoteListItem[];
      const ownerNames = await this.resolveRemoteOwnerNames(connection.client, entries);
      this.log("remote:listDirectory success", {
        connectionId,
        normalizedPath,
        listAttempted: true,
        itemCount: entries.length
      });
      return {
        path: normalizedPath,
        entries: entries.map((entry) => this.mapRemoteEntry(normalizedPath, entry, ownerNames))
      };
    } catch (error) {
      const raw = this.extractRawError(error);
      this.log("remote:listDirectory list failed", {
        connectionId,
        normalizedPath,
        listAttempted: true,
        errorName: raw.name,
        errorCode: raw.code,
        errorMessage: raw.message
      });

      const mappedError = this.mapListError(error);
      if (mappedError.code === "REMOTE_DISCONNECTED") {
        void this.connectionManager.disconnect(connectionId).catch(() => undefined);
        throw mappedError;
      }

      // Optional diagnostic only. Do not use stat to pre-reject directory browsing.
      try {
        const stat = await connection.client.stat(normalizedPath);
        this.log("remote:listDirectory stat diagnostic", {
          connectionId,
          normalizedPath,
          statType: stat.type
        });
      } catch (statError) {
        const statRaw = this.extractRawError(statError);
        this.log("remote:listDirectory stat diagnostic failed", {
          connectionId,
          normalizedPath,
          statErrorName: statRaw.name,
          statErrorCode: statRaw.code,
          statErrorMessage: statRaw.message
        });
      }

      throw mappedError;
    }
  }

  async getHomeDirectory(connectionId: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    return connection.homePath;
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.connectionManager.disconnect(connectionId);
  }

  async renamePath(connectionId: string, targetPath: string, newName: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");

    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === "." || trimmedName === "..") {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "New name is invalid.");
    }
    if (trimmedName.includes("/") || trimmedName.includes("\\")) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "New name cannot contain path separators.");
    }

    const normalizedPath = this.normalizeRemotePath(targetPath);
    const destinationPath = posixPath.join(posixPath.dirname(normalizedPath), trimmedName);

    try {
      const clientWithRename = connection.client as unknown as { rename: (from: string, to: string) => Promise<unknown> };
      await clientWithRename.rename(normalizedPath, destinationPath);
      return destinationPath;
    } catch (error) {
      throw this.mapRenameError(error);
    }
  }

  async deletePaths(connectionId: string, paths: string[]): Promise<number> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    if (paths.length === 0) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Select at least one remote path to delete.");
    }

    const normalizedPaths = unique(paths.map((item) => this.normalizeRemotePath(item)));
    let deleted = 0;
    const client = connection.client as unknown as RemoteDeleteClient;
    for (const targetPath of normalizedPaths) {
      try {
        await this.deleteRemotePath(client, targetPath);
        deleted += 1;
      } catch (error) {
        throw this.mapDeleteError(error);
      }
    }
    return deleted;
  }

  async makeDirectory(connectionId: string, parentPath: string, name: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const trimmedName = this.validateNewChildName(name);
    const targetPath = posixPath.join(this.normalizeRemotePath(parentPath), trimmedName);
    try {
      const client = connection.client as unknown as { mkdir: (path: string) => Promise<unknown> };
      await client.mkdir(targetPath);
      return targetPath;
    } catch (error) {
      throw this.mapMkdirError(error);
    }
  }

  async createTextFile(connectionId: string, parentPath: string, name?: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const client = connection.client as unknown as RemoteCreateClient;
    const normalizedParent = this.normalizeRemotePath(parentPath);
    const targetPath = name?.trim()
      ? posixPath.join(normalizedParent, this.validateNewChildName(name))
      : await this.nextAvailableTextFilePath(client, normalizedParent);
    try {
      if (name?.trim()) await this.assertRemotePathAvailable(client, targetPath);
      await client.put(Buffer.from(""), targetPath);
      return targetPath;
    } catch (error) {
      throw this.mapCreateFileError(error);
    }
  }

  async chmodPath(connectionId: string, targetPath: string, mode: number): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Permissions must be an octal mode from 000 to 777.");
    }
    try {
      const client = connection.client as unknown as { chmod: (path: string, mode: number) => Promise<unknown> };
      await client.chmod(this.normalizeRemotePath(targetPath), mode);
    } catch (error) {
      throw this.mapChmodError(error);
    }
  }

  async duplicateFile(connectionId: string, targetPath: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    try {
      const client = connection.client as unknown as RemoteDuplicateClient;
      const stat = (await client.stat(normalizedPath)) as RemoteStatItem;
      if (resolveRemoteType(stat) !== "file") {
        throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Only remote files can be duplicated in this version.");
      }
      if ((stat.size ?? 0) > 50 * 1024 * 1024) {
        throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Remote duplicate is limited to files up to 50 MB.");
      }
      const destinationPath = await this.nextDuplicatePath(client, normalizedPath);
      const data = await client.get(normalizedPath);
      await client.put(data, destinationPath);
      return destinationPath;
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapDuplicateError(error);
    }
  }

  async copyPath(
    connectionId: string,
    sourcePath: string,
    destinationPath: string,
    options?: { conflictPolicy?: "fail" | "rename"; forceDestinationDirectory?: boolean }
  ): Promise<string> {
    return this.copyOrMovePath("copy", connectionId, sourcePath, destinationPath, options);
  }

  async movePath(
    connectionId: string,
    sourcePath: string,
    destinationPath: string,
    options?: { conflictPolicy?: "fail" | "rename"; forceDestinationDirectory?: boolean }
  ): Promise<string> {
    return this.copyOrMovePath("move", connectionId, sourcePath, destinationPath, options);
  }

  private async copyOrMovePath(
    operation: "copy" | "move",
    connectionId: string,
    sourcePath: string,
    destinationPath: string,
    options?: { conflictPolicy?: "fail" | "rename"; forceDestinationDirectory?: boolean }
  ): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedSource = this.normalizeRemotePath(sourcePath);
    const normalizedDestinationInput = this.normalizeRemotePath(destinationPath);
    if (normalizedSource === "/") {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Refusing to copy or move the remote root directory.");
    }
    const client = connection.client as unknown as RemoteCopyMoveClient;
    try {
      await client.stat(normalizedSource);
      const destination = await this.resolveCopyMoveTarget(client, normalizedSource, normalizedDestinationInput, {
        conflictPolicy: options?.conflictPolicy ?? "fail",
        forceDestinationDirectory: !!options?.forceDestinationDirectory
      });
      if (normalizedSource === destination) {
        throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Source and destination are the same.");
      }
      if (operation === "move" && pathContains(normalizedSource, destination)) {
        throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Cannot move a folder into itself.");
      }
      const exec = client.client?.exec?.bind(client.client);
      if (!exec) {
        throw new RemoteServiceError(operation === "copy" ? "REMOTE_COPY_FAILED" : "REMOTE_MOVE_FAILED", "Remote command execution is unavailable.");
      }
      await execRemoteCommand(
        exec,
        operation === "copy" ? buildRemoteCopyCommand(normalizedSource, destination) : buildRemoteMoveCommand(normalizedSource, destination),
        {
          code: operation === "copy" ? "REMOTE_COPY_FAILED" : "REMOTE_MOVE_FAILED",
          message: operation === "copy" ? "Remote copy command failed." : "Remote move command failed."
        }
      );
      return destination;
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw operation === "copy" ? this.mapCopyError(error) : this.mapMoveError(error);
    }
  }

  private async resolveCopyMoveTarget(
    client: RemoteCopyMoveClient,
    sourcePath: string,
    destinationInput: string,
    options: { conflictPolicy: "fail" | "rename"; forceDestinationDirectory: boolean }
  ): Promise<string> {
    let treatAsDirectory = options.forceDestinationDirectory;
    if (!treatAsDirectory) {
      try {
        const stat = await client.stat(destinationInput);
        treatAsDirectory = resolveRemoteType(stat) === "directory";
      } catch (error) {
        if (!isMissingRemotePathError(error)) throw error;
      }
    }
    let targetPath = treatAsDirectory ? posixPath.join(destinationInput, posixPath.basename(sourcePath)) : destinationInput;
    try {
      await client.stat(targetPath);
      if (options.conflictPolicy !== "rename") {
        throw new RemoteServiceError("REMOTE_COPY_FAILED", "Remote destination already exists.");
      }
      targetPath = await this.nextCopyMovePath(client, targetPath);
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      if (!isMissingRemotePathError(error)) throw error;
    }
    return targetPath;
  }

  async compressFileGzip(connectionId: string, targetPath: string, options?: { deleteSourceAfterSuccess?: boolean }): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const client = connection.client as unknown as RemoteCompressClient;
    try {
      const sourceStat = (await client.stat(normalizedPath)) as RemoteStatItem;
      const sourceType = resolveRemoteType(sourceStat);
      if (sourceType !== "file" && sourceType !== "directory") throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Only remote files and folders can be compressed.");
      const destinationPath = this.normalizeRemotePath(sourceType === "directory" ? `${normalizedPath}.tar.gz` : `${normalizedPath}.gz`);
      try {
        await client.stat(destinationPath);
        throw new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Compression target already exists.");
      } catch (error) {
        if (error instanceof RemoteServiceError) throw error;
        const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
        if (!/No such file|ENOENT|no such path|does not exist/i.test(message)) throw error;
      }
      const exec = client.client?.exec?.bind(client.client);
      if (!exec) throw new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Remote command execution is unavailable for gzip.");
      const tempPath = `${destinationPath}.cofinder-${Date.now()}-${randomUUID().slice(0, 8)}.tmp`;
      const command = sourceType === "directory"
        ? buildRemoteTarGzipCommand(normalizedPath, destinationPath, tempPath, !!options?.deleteSourceAfterSuccess)
        : buildRemoteGzipCommand(normalizedPath, destinationPath, tempPath, !!options?.deleteSourceAfterSuccess);
      await execRemoteCommand(exec, command);
      return destinationPath;
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapCompressError(error);
    }
  }

  async decompressPath(connectionId: string, targetPath: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const client = connection.client as unknown as RemoteCompressClient;
    try {
      const sourceStat = (await client.stat(normalizedPath)) as RemoteStatItem;
      if (resolveRemoteType(sourceStat) !== "file") throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Only compressed remote files can be decompressed.");
      const destinationPath = remoteDecompressDestination(normalizedPath);
      const exec = client.client?.exec?.bind(client.client);
      if (!exec) throw new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Remote command execution is unavailable for decompress.");
      const tempPath = `${destinationPath}.cofinder-${Date.now()}-${randomUUID().slice(0, 8)}.tmp`;
      const command = remoteIsTarGzipPath(normalizedPath)
        ? buildRemoteTarDecompressCommand(normalizedPath)
        : buildRemoteGunzipCommand(normalizedPath, destinationPath, tempPath);
      await execRemoteCommand(exec, command);
      return destinationPath;
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapCompressError(error);
    }
  }

  async generateMd5File(connectionId: string, targetPath: string): Promise<string> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const destinationPath = this.normalizeRemotePath(`${normalizedPath}.md5`);
    const client = connection.client as unknown as RemoteCompressClient;
    try {
      const sourceStat = (await client.stat(normalizedPath)) as RemoteStatItem;
      if (resolveRemoteType(sourceStat) !== "file") throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Only files can have an MD5 sidecar generated.");
      try {
        await client.stat(destinationPath);
        throw new RemoteServiceError("REMOTE_COMPRESS_FAILED", "MD5 target already exists.");
      } catch (error) {
        if (error instanceof RemoteServiceError) throw error;
        const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
        if (!/No such file|ENOENT|no such path|does not exist/i.test(message)) throw error;
      }
      const exec = client.client?.exec?.bind(client.client);
      if (!exec) throw new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Remote command execution is unavailable for MD5.");
      const tempPath = `${destinationPath}.cofinder-${Date.now()}-${randomUUID().slice(0, 8)}.tmp`;
      await execRemoteCommand(exec, buildRemoteMd5Command(normalizedPath, destinationPath, tempPath));
      return destinationPath;
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapCompressError(error);
    }
  }

  async touchPath(connectionId: string, targetPath: string, options?: { timestamp?: string }): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const client = connection.client as unknown as RemoteCompressClient;
    try {
      await client.stat(normalizedPath);
      const exec = client.client?.exec?.bind(client.client);
      if (!exec) throw new RemoteServiceError("REMOTE_TOUCH_FAILED", "Remote command execution is unavailable for touch.");
      const touchStamp = options?.timestamp ? timestampInputToTouchStamp(options.timestamp) : undefined;
      await execRemoteCommand(exec, buildRemoteTouchCommand(normalizedPath, touchStamp), {
        code: "REMOTE_TOUCH_FAILED",
        message: "Remote touch command failed."
      });
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapTouchError(error);
    }
  }

  async downloadPathToLocal(connectionId: string, remotePath: string, localTargetPath: string): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedRemotePath = this.normalizeRemotePath(remotePath);
    const normalizedLocalPath = path.resolve(localTargetPath);
    try {
      await this.downloadRemotePathRecursive(connection.client as unknown as RemoteDownloadClient, normalizedRemotePath, normalizedLocalPath);
    } catch (error) {
      throw this.mapDownloadError(error);
    }
  }

  async uploadPathToRemote(connectionId: string, localPath: string, remoteTargetPath: string): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedLocalPath = path.resolve(localPath);
    const normalizedRemotePath = this.normalizeRemotePath(remoteTargetPath);
    try {
      await this.uploadLocalPathRecursive(connection.client as unknown as RemoteUploadClient, normalizedLocalPath, normalizedRemotePath);
    } catch (error) {
      throw this.mapUploadError(error);
    }
  }

  async getPathInfo(connectionId: string, targetPath: string, options?: { includeDirectorySize?: boolean }): Promise<PathInfo> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    try {
      const stat = (await connection.client.stat(normalizedPath)) as RemoteStatItem;
      const parentEntry = await this.findParentListEntry(connection.client, normalizedPath).catch(() => undefined);
      const type = resolveRemoteType(stat);
      const size = type === "directory" && options?.includeDirectorySize !== false
        ? await this.getRemoteDirectorySize(connection.client as unknown as RemoteDeleteClient, normalizedPath)
        : (stat.size ?? 0);
      const counts = type === "directory"
        ? await this.getRemoteDirectoryChildCounts(connection.client as unknown as RemoteDeleteClient, normalizedPath)
        : {};
      const ownerValue = stat.owner ?? parentEntry?.owner;
      const groupValue = stat.group ?? parentEntry?.group;
      const ownerNames = await this.resolveRemoteOwnerNames(connection.client, [stat, ...(parentEntry ? [parentEntry] : [])]);
      const rights = stat.rights ? rightsToRwx(stat.rights) : parentEntry?.rights ? rightsToRwx(parentEntry.rights) : undefined;
      return {
        name: posixPath.basename(normalizedPath),
        fullPath: normalizedPath,
        type,
        size,
        mtime: new Date(stat.modifyTime ?? Date.now()).toISOString(),
        permissions: rights ?? (typeof stat.mode === "number" ? modeToRwx(stat.mode) : undefined),
        owner: ownerValue !== undefined ? ownerNames.get(String(ownerValue)) ?? String(ownerValue) : undefined,
        group: groupValue !== undefined ? String(groupValue) : undefined,
        ...counts
      };
    } catch (error) {
      throw this.mapInfoError(error);
    }
  }

  async readTextFile(connectionId: string, targetPath: string, options: { byteOffset?: number; maxBytes?: number } = {}): Promise<TextContentReadResponse> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const byteOffset = normalizeByteOffset(options.byteOffset);
    const maxBytes = normalizeTextReadLimit(options.maxBytes);
    const client = connection.client as unknown as RemoteContentClient;
    try {
      const stat = (await client.stat(normalizedPath)) as RemoteStatItem;
      if (resolveRemoteType(stat) !== "file") throw new RemoteServiceError("REMOTE_CONTENT_FAILED", "View Text supports files only.");
      const size = stat.size ?? 0;
      const chunk = await readRemoteFileChunk(client, normalizedPath, byteOffset, maxBytes);
      if (byteOffset === 0 && sniffPreviewKind(chunk.subarray(0, Math.min(TEXT_SNIFF_BYTES, chunk.length))) !== "text") {
        throw new RemoteServiceError("REMOTE_CONTENT_FAILED", "Selected remote file does not look like text.");
      }
      const nextByteOffset = byteOffset + chunk.length;
      return {
        path: normalizedPath,
        content: chunk.toString("utf8"),
        byteOffset,
        nextByteOffset,
        size,
        truncated: nextByteOffset < size
      };
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapContentError(error);
    }
  }

  async searchText(connectionId: string, targetPath: string, query: string, options: { maxMatches?: number } = {}): Promise<TextSearchResponse> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const trimmedQuery = query.trim();
    const maxMatches = normalizeSearchMatchLimit(options.maxMatches);
    if (!trimmedQuery) throw new RemoteServiceError("REMOTE_CONTENT_FAILED", "Search query is required.");
    const client = connection.client as unknown as RemoteContentClient;
    try {
      const stat = (await client.stat(normalizedPath)) as RemoteStatItem;
      const type = resolveRemoteType(stat);
      if (type !== "file" && type !== "directory") throw new RemoteServiceError("REMOTE_CONTENT_FAILED", "Search Contents supports files and folders only.");
      const exec = client.client?.exec?.bind(client.client);
      if (!exec) throw new RemoteServiceError("REMOTE_CONTENT_FAILED", "Remote command execution is unavailable for Search Contents.");
      const output = await execRemoteOutput(exec, buildRemoteSearchCommand(normalizedPath, trimmedQuery, maxMatches), {
        code: "REMOTE_CONTENT_FAILED",
        message: "Remote search command failed."
      });
      const parsed = parseRemoteSearchOutput(output.toString("utf8"), maxMatches);
      return {
        query: trimmedQuery,
        rootPath: normalizedPath,
        matches: parsed.matches,
        truncated: parsed.truncated,
        tool: parsed.tool
      };
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
      throw this.mapContentError(error);
    }
  }

  async calculateDirectorySize(
    connectionId: string,
    targetPath: string,
    options: RemoteDirectorySizeOptions = {}
  ): Promise<RemoteDirectorySizeResult> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    const stat = (await connection.client.stat(normalizedPath)) as RemoteStatItem;
    if (resolveRemoteType(stat) !== "directory") {
      throw new RemoteServiceError("REMOTE_NOT_DIRECTORY", "Remote path is not a directory.");
    }
    try {
      const state = { visitedEntries: 0, capped: false };
      const size = await this.getRemoteDirectorySizeLimited(connection.client as unknown as RemoteDeleteClient, normalizedPath, {
        signal: options.signal,
        maxEntries: options.maxEntries ?? 20_000,
        maxDepth: options.maxDepth ?? 32,
        depth: 0,
        state
      });
      return { size, visitedEntries: state.visitedEntries, capped: state.capped };
    } catch (error) {
      throw this.mapInfoError(error);
    }
  }

  private normalizeRemotePath(inputPath: string): string {
    return normalizeRemotePosixPath(inputPath.trim() || "/");
  }

  private validateNewChildName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\") || /[\u0000\r\n]/.test(trimmed)) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Remote name is invalid.");
    }
    return trimmed;
  }

  private mapRemoteEntry(basePath: string, entry: RemoteListItem, ownerNames: Map<string, string>): RemoteFileEntry {
    const fullPath = basePath === "/" ? `/${entry.name}` : posixPath.join(basePath, entry.name);
    return {
      name: entry.name,
      fullPath,
      type: entry.type === "d" ? "directory" : entry.type === "-" ? "file" : entry.type === "l" ? "symlink" : "unknown",
      size: entry.size ?? 0,
      mtime: new Date((entry.modifyTime ?? Date.now())).toISOString(),
      permissions: entry.rights ? rightsToRwx(entry.rights) : undefined,
      owner: entry.owner !== undefined ? ownerNames.get(String(entry.owner)) ?? String(entry.owner) : undefined,
      group: entry.group !== undefined ? String(entry.group) : undefined,
      isHidden: entry.name.startsWith(".")
    };
  }

  private async findParentListEntry(client: unknown, normalizedPath: string): Promise<RemoteListItem | undefined> {
    const parentPath = posixPath.dirname(normalizedPath);
    if (!parentPath || parentPath === normalizedPath) return undefined;
    const name = posixPath.basename(normalizedPath);
    const listClient = client as { list?: (path: string) => Promise<unknown[]> };
    if (typeof listClient.list !== "function") return undefined;
    const entries = (await listClient.list(parentPath)) as RemoteListItem[];
    return entries.find((entry) => entry.name === name);
  }

  private async resolveRemoteOwnerNames(client: unknown, entries: Array<{ owner?: number | string }>): Promise<Map<string, string>> {
    const ownerIds = Array.from(
      new Set(
        entries
          .map((entry) => (entry.owner === undefined ? "" : String(entry.owner)))
          .filter((owner) => /^\d+$/.test(owner))
      )
    );
    const out = new Map<string, string>();
    const cacheKey = typeof client === "object" && client !== null ? client : null;
    const cache = cacheKey ? this.ownerNameCache.get(cacheKey) ?? new Map<string, string>() : null;
    if (cacheKey && cache && !this.ownerNameCache.has(cacheKey)) this.ownerNameCache.set(cacheKey, cache);
    await Promise.all(
      ownerIds.map(async (uid) => {
        const cached = cache?.get(uid);
        if (cached) {
          out.set(uid, cached);
          return;
        }
        const name = await resolveRemoteUidName(client, uid);
        if (name !== uid) cache?.set(uid, name);
        out.set(uid, name);
      })
    );
    return out;
  }

  private mapError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote operation failed";
    if (/All configured authentication methods failed|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_AUTH_FAILED", "Authentication failed. Check username or password.", message);
    }
    if (/No such file/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_CONNECTION_FAILED", "Unable to connect to remote host.", message);
    }
    return new RemoteServiceError("REMOTE_UNKNOWN_ERROR", "Unexpected remote error.", message);
  }

  private mapListError(error: unknown): RemoteServiceError {
    if (error instanceof RemoteServiceError) return error;
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote list failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/not a directory|ENOTDIR/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_DIRECTORY", "Remote path is not a directory.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|did not respond|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_LIST_FAILED", "Failed to list remote directory.", message);
  }

  private mapRenameError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote rename failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/already exists|EEXIST/i.test(message)) {
      return new RemoteServiceError("REMOTE_RENAME_FAILED", "A file or folder with the same name already exists.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_RENAME_FAILED", "Failed to rename remote path.", message);
  }

  private async deleteRemotePath(client: RemoteDeleteClient, targetPath: string): Promise<void> {
    assertSafeRemoteDeletePath(targetPath);
    if (await this.deleteRemotePathWithCommandIfAvailable(client, targetPath)) return;
    await this.deleteRemotePathRecursive(client, targetPath);
  }

  private async deleteRemotePathWithCommandIfAvailable(client: RemoteDeleteClient, targetPath: string): Promise<boolean> {
    const exec = (client as RemoteCommandClient).client?.exec?.bind((client as RemoteCommandClient).client);
    if (!exec) return false;
    await execRemoteCommand(exec, buildRemoteDeleteCommand(targetPath), {
      code: "REMOTE_DELETE_FAILED",
      message: "Remote delete command failed."
    });
    return true;
  }

  private async deleteRemotePathRecursive(client: RemoteDeleteClient, targetPath: string): Promise<void> {
    const stat = await client.stat(targetPath);
    if (resolveRemoteType(stat) === "directory") {
      const entries = (await client.list(targetPath)) as RemoteListItem[];
      for (const entry of entries) {
        if (entry.name === "." || entry.name === "..") continue;
        const fullPath = targetPath === "/" ? `/${entry.name}` : posixPath.join(targetPath, entry.name);
        await this.deleteRemotePathRecursive(client, fullPath);
      }
      await client.rmdir(targetPath);
      return;
    }
    await client.delete(targetPath);
  }

  private async getRemoteDirectorySize(client: RemoteDeleteClient, targetPath: string): Promise<number> {
    const entries = (await client.list(targetPath)) as RemoteListItem[];
    let total = 0;
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      const childPath = targetPath === "/" ? `/${entry.name}` : posixPath.join(targetPath, entry.name);
      if (entry.type === "d") {
        total += await this.getRemoteDirectorySize(client, childPath);
      } else if (entry.type === "-") {
        total += entry.size ?? 0;
      } else {
        // Fallback for unknown list entry types.
        const childStat = (await client.stat(childPath)) as RemoteStatItem;
        if (resolveRemoteType(childStat) === "directory") {
          total += await this.getRemoteDirectorySize(client, childPath);
        } else {
          total += childStat.size ?? 0;
        }
      }
    }
    return total;
  }

  private async getRemoteDirectoryChildCounts(client: RemoteDeleteClient, targetPath: string): Promise<{ fileCount: number; folderCount: number }> {
    const entries = (await client.list(targetPath)) as RemoteListItem[];
    let fileCount = 0;
    let folderCount = 0;
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      if (entry.type === "d") folderCount += 1;
      else fileCount += 1;
    }
    return { fileCount, folderCount };
  }

  private async downloadRemotePathRecursive(client: RemoteDownloadClient, remotePath: string, localTargetPath: string): Promise<void> {
    const stat = (await client.stat(remotePath)) as RemoteStatItem;
    if (resolveRemoteType(stat) === "directory") {
      await fs.mkdir(localTargetPath, { recursive: true });
      const entries = (await client.list(remotePath)) as RemoteListItem[];
      for (const entry of entries) {
        if (entry.name === "." || entry.name === "..") continue;
        const childRemotePath = remotePath === "/" ? `/${entry.name}` : posixPath.join(remotePath, entry.name);
        await this.downloadRemotePathRecursive(client, childRemotePath, path.join(localTargetPath, entry.name));
      }
      return;
    }
    await fs.mkdir(path.dirname(localTargetPath), { recursive: true });
    await downloadRemoteFileToLocal(client, remotePath, localTargetPath);
  }

  private async uploadLocalPathRecursive(client: RemoteUploadClient, localPath: string, remoteTargetPath: string): Promise<void> {
    const stat = await fs.stat(localPath);
    if (stat.isDirectory()) {
      await ensureRemoteDirectory(client, remoteTargetPath);
      const entries = await fs.readdir(localPath, { withFileTypes: true });
      for (const entry of entries) {
        await this.uploadLocalPathRecursive(client, path.join(localPath, entry.name), posixPath.join(remoteTargetPath, entry.name));
      }
      return;
    }
    if (!stat.isFile()) throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Only files and folders can be uploaded over SFTP.");
    await ensureRemoteDirectory(client, posixPath.dirname(remoteTargetPath));
    await uploadLocalFileToRemote(client, localPath, remoteTargetPath);
  }

  private async getRemoteDirectorySizeLimited(
    client: RemoteDeleteClient,
    targetPath: string,
    opts: {
      signal?: AbortSignal;
      maxEntries: number;
      maxDepth: number;
      depth: number;
      state: { visitedEntries: number; capped: boolean };
    }
  ): Promise<number> {
    if (opts.signal?.aborted) throw new RemoteServiceError("REMOTE_DIRECTORY_SIZE_FAILED", "Remote directory size was canceled.");
    if (opts.depth > opts.maxDepth || opts.state.visitedEntries >= opts.maxEntries) {
      opts.state.capped = true;
      return 0;
    }
    const entries = (await client.list(targetPath)) as RemoteListItem[];
    let total = 0;
    for (const entry of entries) {
      if (opts.signal?.aborted) throw new RemoteServiceError("REMOTE_DIRECTORY_SIZE_FAILED", "Remote directory size was canceled.");
      if (entry.name === "." || entry.name === "..") continue;
      opts.state.visitedEntries += 1;
      if (opts.state.visitedEntries > opts.maxEntries) {
        opts.state.capped = true;
        break;
      }
      const childPath = targetPath === "/" ? `/${entry.name}` : posixPath.join(targetPath, entry.name);
      if (entry.type === "d") {
        total += await this.getRemoteDirectorySizeLimited(client, childPath, { ...opts, depth: opts.depth + 1 });
      } else if (entry.type === "-") {
        total += entry.size ?? 0;
      }
    }
    return total;
  }

  private async nextDuplicatePath(client: RemoteDuplicateClient, sourcePath: string): Promise<string> {
    const dir = posixPath.dirname(sourcePath);
    const parsed = posixPath.parse(sourcePath);
    for (let i = 1; i <= 999; i += 1) {
      const suffix = i === 1 ? " copy" : ` copy ${i}`;
      const candidate = posixPath.join(dir, `${parsed.name}${suffix}${parsed.ext}`);
      try {
        await client.stat(candidate);
      } catch {
        return candidate;
      }
    }
    throw new RemoteServiceError("REMOTE_DUPLICATE_FAILED", "Could not find an available duplicate name.");
  }

  private async nextCopyMovePath(client: RemoteCopyMoveClient, targetPath: string): Promise<string> {
    const dir = posixPath.dirname(targetPath);
    const parsed = posixPath.parse(targetPath);
    for (let i = 1; i <= 999; i += 1) {
      const suffix = i === 1 ? " copy" : ` copy ${i}`;
      const candidate = posixPath.join(dir, `${parsed.name}${suffix}${parsed.ext}`);
      try {
        await client.stat(candidate);
      } catch (error) {
        if (isMissingRemotePathError(error)) return candidate;
        throw error;
      }
    }
    throw new RemoteServiceError("REMOTE_COPY_FAILED", "Could not find an available destination name.");
  }

  private async nextAvailableTextFilePath(client: RemoteCreateClient, parentPath: string): Promise<string> {
    for (let i = 1; i <= 999; i += 1) {
      const name = i === 1 ? "Untitled.txt" : `Untitled ${i}.txt`;
      const candidate = posixPath.join(parentPath, name);
      try {
        await client.stat(candidate);
      } catch {
        return candidate;
      }
    }
    throw new RemoteServiceError("REMOTE_CREATE_FILE_FAILED", "Could not find an available text file name.");
  }

  private async assertRemotePathAvailable(client: RemoteCreateClient, targetPath: string): Promise<void> {
    try {
      await client.stat(targetPath);
      throw new RemoteServiceError("REMOTE_CREATE_FILE_FAILED", "Remote file already exists.");
    } catch (error) {
      if (error instanceof RemoteServiceError) throw error;
    }
  }

  private mapDeleteError(error: unknown): RemoteServiceError {
    if (error instanceof RemoteServiceError) {
      const detail = `${error.message}\n${error.detail ?? ""}`;
      if (/No such file|ENOENT|no such path|does not exist/i.test(detail)) {
        return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", detail);
      }
      if (/EACCES|Permission denied/i.test(detail)) {
        return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", detail);
      }
      if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(detail)) {
        return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", detail);
      }
      return error;
    }
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote delete failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_DELETE_FAILED", "Failed to delete remote path.", message);
  }

  private mapInfoError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote get info failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_INFO_FAILED", "Failed to load remote path info.", message);
  }

  private mapContentError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote content read failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_CONTENT_FAILED", "Failed to read remote text file.", message);
  }

  private mapMkdirError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote mkdir failed";
    if (/already exists|EEXIST/i.test(message)) return new RemoteServiceError("REMOTE_MKDIR_FAILED", "Remote directory already exists.", message);
    if (/EACCES|Permission denied/i.test(message)) return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    if (/No such file|ENOENT/i.test(message)) return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote parent path does not exist.", message);
    return new RemoteServiceError("REMOTE_MKDIR_FAILED", "Failed to create remote directory.", message);
  }

  private mapCreateFileError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote create file failed";
    if (/already exists|EEXIST/i.test(message)) return new RemoteServiceError("REMOTE_CREATE_FILE_FAILED", "Remote file already exists.", message);
    if (/EACCES|Permission denied/i.test(message)) return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    if (/No such file|ENOENT/i.test(message)) return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote parent path does not exist.", message);
    return new RemoteServiceError("REMOTE_CREATE_FILE_FAILED", "Failed to create remote text file.", message);
  }

  private mapChmodError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote chmod failed";
    if (/EACCES|Permission denied/i.test(message)) return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    if (/No such file|ENOENT/i.test(message)) return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    return new RemoteServiceError("REMOTE_CHMOD_FAILED", "Failed to change remote permissions.", message);
  }

  private mapDuplicateError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote duplicate failed";
    if (/EACCES|Permission denied/i.test(message)) return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    if (/No such file|ENOENT/i.test(message)) return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    return new RemoteServiceError("REMOTE_DUPLICATE_FAILED", "Failed to duplicate remote file.", message);
  }

  private mapCopyError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote copy failed";
    if (/EACCES|Permission denied/i.test(message)) return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    if (/already exists|EEXIST/i.test(message)) return new RemoteServiceError("REMOTE_COPY_FAILED", "Copy target already exists.", message);
    return new RemoteServiceError("REMOTE_COPY_FAILED", "Failed to copy remote path.", message);
  }

  private mapMoveError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote move failed";
    if (/EACCES|Permission denied/i.test(message)) return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    if (/already exists|EEXIST/i.test(message)) return new RemoteServiceError("REMOTE_MOVE_FAILED", "Move target already exists.", message);
    return new RemoteServiceError("REMOTE_MOVE_FAILED", "Failed to move remote path.", message);
  }

  private mapCompressError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote gzip compression failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/already exists|EEXIST/i.test(message)) {
      return new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Gzip target already exists.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Failed to compress remote file.", message);
  }

  private mapTouchError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote touch failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_TOUCH_FAILED", "Failed to touch remote path.", message);
  }

  private mapDownloadError(error: unknown): RemoteServiceError {
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote download failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
    }
    if (/EACCES|Permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_UNKNOWN_ERROR", "Failed to download remote path.", message);
  }

  private mapUploadError(error: unknown): RemoteServiceError {
    if (error instanceof RemoteServiceError) return error;
    const message =
      typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Remote upload failed";
    if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
      return new RemoteServiceError("REMOTE_NOT_FOUND", "Local or remote path does not exist.", message);
    }
    if (/EACCES|Permission denied|permission denied/i.test(message)) {
      return new RemoteServiceError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
    }
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
    }
    return new RemoteServiceError("REMOTE_UNKNOWN_ERROR", "Failed to upload local path.", message);
  }

  private extractRawError(error: unknown): { name: string; code: string; message: string } {
    const err = error as { name?: unknown; code?: unknown; message?: unknown };
    return {
      name: err?.name ? String(err.name) : "UnknownError",
      code: err?.code ? String(err.code) : "",
      message: err?.message ? String(err.message) : "Unknown remote error"
    };
  }

  private log(message: string, payload: Record<string, unknown>): void {
    // Keep diagnostics focused; never include credentials.
    console.info(`[RemoteFileService] ${message}`, payload);
  }
}

type RemoteDeleteClient = {
  stat: (path: string) => Promise<RemoteStatItem>;
  list: (path: string) => Promise<unknown[]>;
  delete: (path: string) => Promise<unknown>;
  rmdir: (path: string) => Promise<unknown>;
};

type RemoteDuplicateClient = RemoteDeleteClient & {
  get: (path: string) => Promise<Buffer | NodeJS.ReadableStream>;
  put: (input: Buffer | NodeJS.ReadableStream, path: string) => Promise<unknown>;
};

type RemoteCreateClient = {
  stat: (path: string) => Promise<RemoteStatItem>;
  put: (input: Buffer | NodeJS.ReadableStream, path: string) => Promise<unknown>;
};

function unique(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

type RemoteExec = (command: string, callback: (error: Error | undefined, stream: unknown) => void) => void;
type RemoteCommandFailureOptions = {
  code: RemoteErrorCode;
  message: string;
};

const REMOTE_DELETE_NOT_FOUND_SENTINEL = "__COFINDER_REMOTE_DELETE_NOT_FOUND__";

function buildRemoteDeleteCommand(targetPath: string): string {
  const target = shellQuote(targetPath);
  const sentinel = shellQuote(REMOTE_DELETE_NOT_FOUND_SENTINEL);
  return `if [ ! -e ${target} ] && [ ! -L ${target} ]; then printf '%s\\n' ${sentinel} >&2; exit 66; fi; rm -rf -- ${target}`;
}

function buildRemoteGzipCommand(sourcePath: string, destinationPath: string, tempPath: string, deleteSourceAfterSuccess: boolean): string {
  const src = shellQuote(sourcePath);
  const dst = shellQuote(destinationPath);
  const tmp = shellQuote(tempPath);
  const removeSource = deleteSourceAfterSuccess ? ` && rm -- ${src}` : "";
  return [
    `rm -f -- ${tmp}`,
    `gzip -c -- ${src} > ${tmp}`,
    `mv -- ${tmp} ${dst}${removeSource}`
  ].join(" && ");
}

function buildRemoteTarGzipCommand(sourcePath: string, destinationPath: string, tempPath: string, deleteSourceAfterSuccess: boolean): string {
  const src = shellQuote(sourcePath);
  const parent = shellQuote(posixPath.dirname(sourcePath) || "/");
  const base = shellQuote(posixPath.basename(sourcePath));
  const dst = shellQuote(destinationPath);
  const tmp = shellQuote(tempPath);
  const removeSource = deleteSourceAfterSuccess ? ` && rm -rf -- ${src}` : "";
  return [
    `rm -f -- ${tmp}`,
    `tar -czf ${tmp} -C ${parent} -- ${base}`,
    `mv -- ${tmp} ${dst}${removeSource}`
  ].join(" && ");
}

function remoteIsTarGzipPath(input: string): boolean {
  return input.endsWith(".tar.gz") || input.endsWith(".tgz");
}

function remoteDecompressDestination(input: string): string {
  if (input.endsWith(".tar.gz")) return input.slice(0, -7);
  if (input.endsWith(".tgz")) return input.slice(0, -4);
  if (input.endsWith(".gz")) return input.slice(0, -3);
  throw new RemoteServiceError("REMOTE_COMPRESS_FAILED", "Selected item is not a supported compressed file.");
}

function buildRemoteGunzipCommand(sourcePath: string, destinationPath: string, tempPath: string): string {
  const src = shellQuote(sourcePath);
  const dst = shellQuote(destinationPath);
  const tmp = shellQuote(tempPath);
  return [
    `if [ -e ${dst} ] || [ -L ${dst} ]; then printf '%s\\n' 'Decompress target already exists.' >&2; exit 73; fi`,
    `rm -f -- ${tmp}`,
    `gzip -cd -- ${src} > ${tmp}`,
    `mv -- ${tmp} ${dst}`
  ].join(" && ");
}

function buildRemoteTarDecompressCommand(sourcePath: string): string {
  const src = shellQuote(sourcePath);
  const parent = shellQuote(posixPath.dirname(sourcePath) || "/");
  return [
    `for p in $(tar -tzf ${src} | awk -F/ 'NF {print $1}' | sort -u); do if [ -e ${parent}/"$p" ] || [ -L ${parent}/"$p" ]; then printf '%s\\n' 'Decompress target already exists.' >&2; exit 73; fi; done`,
    `tar -xzf ${src} -C ${parent}`
  ].join(" && ");
}

function buildRemoteMd5Command(sourcePath: string, destinationPath: string, tempPath: string): string {
  const src = shellQuote(sourcePath);
  const parent = shellQuote(posixPath.dirname(sourcePath) || "/");
  const base = shellQuote(posixPath.basename(sourcePath));
  const dst = shellQuote(destinationPath);
  const tmp = shellQuote(tempPath);
  return [
    `if [ -e ${dst} ] || [ -L ${dst} ]; then printf '%s\\n' 'MD5 target already exists.' >&2; exit 73; fi`,
    `rm -f -- ${tmp}`,
    `cd ${parent} && md5sum -- ${base} > ${tmp}`,
    `mv -- ${tmp} ${dst}`
  ].join(" && ");
}

function buildRemoteCopyCommand(sourcePath: string, destinationPath: string): string {
  return `cp -a -- ${shellQuote(sourcePath)} ${shellQuote(destinationPath)}`;
}

function buildRemoteMoveCommand(sourcePath: string, destinationPath: string): string {
  return `mv -- ${shellQuote(sourcePath)} ${shellQuote(destinationPath)}`;
}

function buildRemoteTouchCommand(targetPath: string, touchStamp?: string): string {
  const target = shellQuote(targetPath);
  const timestampArgs = touchStamp ? `-t ${shellQuote(touchStamp)} ` : "";
  return `if [ ! -e ${target} ] && [ ! -L ${target} ]; then exit 66; fi; touch ${timestampArgs}-- ${target}`;
}

function buildRemoteReadChunkCommand(targetPath: string, byteOffset: number, maxBytes: number): string {
  return `LC_ALL=C dd if=${shellQuote(targetPath)} bs=1 skip=${byteOffset} count=${maxBytes} 2>/dev/null`;
}

function buildRemoteSearchCommand(targetPath: string, query: string, maxMatches: number): string {
  const root = shellQuote(targetPath);
  const needle = shellQuote(query);
  const lineLimit = maxMatches + 1;
  const marker = shellQuote(REMOTE_SEARCH_TOOL_MARKER);
  return [
    "set +e",
    "if command -v rg >/dev/null 2>&1; then",
    `  printf '%srg\\n' ${marker}`,
    `  rg --line-number --with-filename --fixed-strings --no-heading --color never -- ${needle} ${root} | head -n ${lineLimit}`,
    "  exit 0",
    "fi",
    "if command -v grep >/dev/null 2>&1; then",
    `  printf '%sgrep\\n' ${marker}`,
    `  if [ -d ${root} ]; then grep -R -n -H -F -- ${needle} ${root}; else grep -n -H -F -- ${needle} ${root}; fi | head -n ${lineLimit}`,
    "  exit 0",
    "fi",
    "printf '%s\\n' 'Neither rg nor grep is available on the remote server.' >&2",
    "exit 127"
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function assertSafeRemoteDeletePath(targetPath: string): void {
  if (!targetPath || targetPath === "/" || targetPath === "." || targetPath === "..") {
    throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Refusing to delete unsafe remote path.");
  }
}

function pathContains(parent: string, child: string): boolean {
  const normalizedParent = posixPath.normalize(parent).replace(/\/+$/, "") || "/";
  const normalizedChild = posixPath.normalize(child).replace(/\/+$/, "") || "/";
  return normalizedChild.startsWith(`${normalizedParent}/`);
}

function isMissingRemotePathError(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  return /No such file|ENOENT|no such path|does not exist/i.test(message);
}

function normalizeByteOffset(value: unknown): number {
  const numeric = typeof value === "number" ? value : 0;
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
}

function normalizeTextReadLimit(value: unknown): number {
  const numeric = typeof value === "number" ? value : DEFAULT_TEXT_READ_BYTES;
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TEXT_READ_BYTES;
  return Math.min(Math.floor(numeric), DEFAULT_TEXT_READ_BYTES);
}

function normalizeSearchMatchLimit(value: unknown): number {
  const numeric = typeof value === "number" ? value : DEFAULT_TEXT_SEARCH_MATCHES;
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TEXT_SEARCH_MATCHES;
  return Math.min(Math.floor(numeric), DEFAULT_TEXT_SEARCH_MATCHES);
}

function parseRemoteSearchOutput(output: string, maxMatches: number): { matches: TextSearchResponse["matches"]; truncated: boolean; tool: "rg" | "grep" } {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const marker = lines[0]?.startsWith(REMOTE_SEARCH_TOOL_MARKER) ? lines.shift() : undefined;
  const tool = marker?.endsWith("grep") ? "grep" : "rg";
  const matches: TextSearchResponse["matches"] = [];
  for (const line of lines) {
    const parsed = parseSearchLine(line);
    if (!parsed) continue;
    matches.push(parsed);
    if (matches.length >= maxMatches) break;
  }
  return { matches, truncated: lines.length > matches.length, tool };
}

function parseSearchLine(line: string): TextSearchResponse["matches"][number] | null {
  const match = /^(.*):(\d+):(.*)$/.exec(line);
  if (!match) return null;
  return {
    path: match[1],
    line: Number(match[2]),
    preview: match[3]
  };
}

async function readRemoteFileChunk(client: RemoteContentClient, remotePath: string, byteOffset: number, maxBytes: number): Promise<Buffer> {
  if (maxBytes <= 0) return Buffer.alloc(0);
  const exec = client.client?.exec?.bind(client.client);
  if (exec) {
    return execRemoteOutput(exec, buildRemoteReadChunkCommand(remotePath, byteOffset, maxBytes), {
      code: "REMOTE_CONTENT_FAILED",
      message: "Remote text read command failed."
    });
  }
  if (byteOffset === 0 && typeof client.get === "function") {
    const result = await client.get(remotePath);
    if (Buffer.isBuffer(result)) return result.subarray(0, maxBytes);
  }
  throw new RemoteServiceError("REMOTE_CONTENT_FAILED", "Remote chunked text reading is unavailable for this connection.");
}

async function downloadRemoteFileToLocal(client: RemoteDownloadClient, remotePath: string, localPath: string): Promise<void> {
  if (typeof client.fastGet === "function") {
    await client.fastGet(remotePath, localPath);
    return;
  }
  if (typeof client.get === "function") {
    const result = await client.get(remotePath, localPath);
    if (Buffer.isBuffer(result)) await fs.writeFile(localPath, result);
    return;
  }
  throw new RemoteServiceError("REMOTE_UNKNOWN_ERROR", "SFTP download is unavailable for this connection.");
}

async function ensureRemoteDirectory(client: RemoteUploadClient, remotePath: string): Promise<void> {
  if (!remotePath || remotePath === "." || remotePath === "/") return;
  await client.mkdir(remotePath, true);
}

async function uploadLocalFileToRemote(client: RemoteUploadClient, localPath: string, remotePath: string): Promise<void> {
  if (typeof client.fastPut === "function") {
    await client.fastPut(localPath, remotePath);
    return;
  }
  if (typeof client.put === "function") {
    await client.put(createReadStream(localPath), remotePath);
    return;
  }
  throw new RemoteServiceError("REMOTE_UNKNOWN_ERROR", "SFTP upload is unavailable for this connection.");
}

async function execRemoteCommand(
  exec: RemoteExec,
  command: string,
  failure: RemoteCommandFailureOptions = { code: "REMOTE_COMPRESS_FAILED", message: "Remote gzip command failed." }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    try {
      exec(command, (error, stream) => {
        if (error || !stream || typeof stream !== "object") {
          reject(error ?? new RemoteServiceError(failure.code, "Remote command execution failed."));
          return;
        }
        const readable = stream as {
          on: (event: string, listener: (...args: unknown[]) => void) => unknown;
          stderr?: { on: (event: string, listener: (...args: unknown[]) => void) => unknown };
        };
        let settled = false;
        let exitCode: unknown;
        const settle = (rawCode: unknown) => {
          if (settled) return;
          settled = true;
          const code = typeof rawCode === "number" ? rawCode : 0;
          if (code === 0) {
            resolve();
            return;
          }
          const detail = stderr.trim().slice(0, 400) || undefined;
          if (detail?.includes(REMOTE_DELETE_NOT_FOUND_SENTINEL)) {
            reject(new RemoteServiceError("REMOTE_NOT_FOUND", "Remote path does not exist.", detail));
            return;
          }
          reject(new RemoteServiceError(failure.code, failure.message, detail));
        };
        readable.on("data", () => {
          // Drain stdout so long-running remote commands cannot block on a full channel buffer.
        });
        readable.stderr?.on("data", (chunk) => {
          stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        });
        readable.on("exit", (code) => {
          exitCode = code;
          settle(code);
        });
        readable.on("close", (code) => {
          settle(typeof code === "number" ? code : exitCode);
        });
        readable.on("error", (streamError) => {
          if (settled) return;
          settled = true;
          reject(streamError instanceof Error ? streamError : new RemoteServiceError(failure.code, failure.message));
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function execRemoteOutput(
  exec: RemoteExec,
  command: string,
  failure: RemoteCommandFailureOptions
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const stdout: Buffer[] = [];
    let stderr = "";
    try {
      exec(command, (error, stream) => {
        if (error || !stream || typeof stream !== "object") {
          reject(error ?? new RemoteServiceError(failure.code, "Remote command execution failed."));
          return;
        }
        const readable = stream as {
          on: (event: string, listener: (...args: unknown[]) => void) => unknown;
          stderr?: { on: (event: string, listener: (...args: unknown[]) => void) => unknown };
        };
        let settled = false;
        let exitCode: unknown;
        const settle = (rawCode: unknown) => {
          if (settled) return;
          settled = true;
          const code = typeof rawCode === "number" ? rawCode : 0;
          if (code === 0) {
            resolve(Buffer.concat(stdout));
            return;
          }
          reject(new RemoteServiceError(failure.code, failure.message, stderr.trim().slice(0, 400) || undefined));
        };
        readable.on("data", (chunk) => {
          stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        readable.stderr?.on("data", (chunk) => {
          stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        });
        readable.on("exit", (code) => {
          exitCode = code;
          settle(code);
        });
        readable.on("close", (code) => {
          settle(typeof code === "number" ? code : exitCode);
        });
        readable.on("error", (streamError) => {
          if (settled) return;
          settled = true;
          reject(streamError instanceof Error ? streamError : new RemoteServiceError(failure.code, failure.message));
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new RemoteServiceError("REMOTE_DISCONNECTED", message, "SFTP operation timed out.")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function resolveRemoteType(stat: RemoteStatItem): "file" | "directory" | "symlink" | "unknown" {
  if (stat.type === "d" || stat.type === "directory" || stat.type === 2) return "directory";
  if (stat.type === "-" || stat.type === "file" || stat.type === 1) return "file";
  if (stat.type === "l" || stat.type === "symlink") return "symlink";
  if (typeof stat.mode === "number") {
    const kind = stat.mode & 0o170000;
    if (kind === 0o040000) return "directory";
    if (kind === 0o100000) return "file";
    if (kind === 0o120000) return "symlink";
  }
  return "unknown";
}

async function resolveRemoteUidName(client: unknown, uid: string): Promise<string> {
  const sshClient = (client as { client?: { exec?: (command: string, callback: (error: Error | undefined, stream: unknown) => void) => void } }).client;
  if (!sshClient?.exec) return uid;
  const exec = sshClient.exec.bind(sshClient);
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      const name = value.trim().split(/\s+/)[0];
      resolve(name || uid);
    };
    timer = setTimeout(() => finish(uid), 2500);
    try {
      exec(`id -nu ${uid} 2>/dev/null`, (error, stream) => {
        if (error || !stream || typeof stream !== "object") {
          finish(uid);
          return;
        }
        const readable = stream as {
          on: (event: string, listener: (...args: unknown[]) => void) => unknown;
          stderr?: { on: (event: string, listener: (...args: unknown[]) => void) => unknown };
        };
        readable.on("data", (chunk) => {
          stdout += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        });
        readable.on("close", () => finish(stdout));
        readable.on("error", () => finish(uid));
      });
    } catch {
      finish(uid);
    }
  });
}
