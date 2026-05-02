import path from "node:path";
import type { ConnectionConfig, RemoteFileEntry } from "../../shared/types/models";
import type { PathInfo, RemoteConnectResponse, RemoteErrorCode, RemoteListDirectoryResponse } from "../../shared/types/ipc";
import { ConnectionManager } from "./ConnectionManager";
import { isSafeHostOrUsername, normalizeRemotePosixPath } from "../utils/pathSafety";

const posixPath = path.posix;
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
      const entries = (await connection.client.list(normalizedPath)) as RemoteListItem[];
      this.log("remote:listDirectory success", {
        connectionId,
        normalizedPath,
        listAttempted: true,
        itemCount: entries.length
      });
      return {
        path: normalizedPath,
        entries: entries.map((entry) => this.mapRemoteEntry(normalizedPath, entry))
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

      throw this.mapListError(error);
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
    for (const targetPath of normalizedPaths) {
      try {
        await this.deleteRemotePathRecursive(connection.client as unknown as RemoteDeleteClient, targetPath);
        deleted += 1;
      } catch (error) {
        throw this.mapDeleteError(error);
      }
    }
    return deleted;
  }

  async getPathInfo(connectionId: string, targetPath: string, options?: { includeDirectorySize?: boolean }): Promise<PathInfo> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) throw new RemoteServiceError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const normalizedPath = this.normalizeRemotePath(targetPath);
    try {
      const stat = (await connection.client.stat(normalizedPath)) as RemoteStatItem;
      const type = resolveRemoteType(stat);
      const size = type === "directory" && options?.includeDirectorySize !== false
        ? await this.getRemoteDirectorySize(connection.client as unknown as RemoteDeleteClient, normalizedPath)
        : (stat.size ?? 0);
      const rights = stat.rights ? rightsToRwx(stat.rights) : undefined;
      return {
        name: posixPath.basename(normalizedPath),
        fullPath: normalizedPath,
        type,
        size,
        mtime: new Date(stat.modifyTime ?? Date.now()).toISOString(),
        permissions: rights ?? (typeof stat.mode === "number" ? modeToRwx(stat.mode) : undefined),
        owner: stat.owner !== undefined ? String(stat.owner) : undefined,
        group: stat.group !== undefined ? String(stat.group) : undefined
      };
    } catch (error) {
      throw this.mapInfoError(error);
    }
  }

  private normalizeRemotePath(inputPath: string): string {
    return normalizeRemotePosixPath(inputPath.trim() || "/");
  }

  private mapRemoteEntry(basePath: string, entry: RemoteListItem): RemoteFileEntry {
    const fullPath = basePath === "/" ? `/${entry.name}` : posixPath.join(basePath, entry.name);
    return {
      name: entry.name,
      fullPath,
      type: entry.type === "d" ? "directory" : entry.type === "-" ? "file" : entry.type === "l" ? "symlink" : "unknown",
      size: entry.size ?? 0,
      mtime: new Date((entry.modifyTime ?? Date.now())).toISOString(),
      permissions: entry.rights ? `${entry.rights.user}${entry.rights.group}${entry.rights.other}` : undefined,
      owner: entry.owner !== undefined ? String(entry.owner) : undefined,
      group: entry.group !== undefined ? String(entry.group) : undefined,
      isHidden: entry.name.startsWith(".")
    };
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
    if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
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

  private async deleteRemotePathRecursive(client: RemoteDeleteClient, targetPath: string): Promise<void> {
    const stat = await client.stat(targetPath);
    if (stat.type === "d") {
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

  private mapDeleteError(error: unknown): RemoteServiceError {
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

function rightsToRwx(rights: { user: string; group: string; other: string }): string {
  return `${normalizeRwx(rights.user)}${normalizeRwx(rights.group)}${normalizeRwx(rights.other)}`;
}

function normalizeRwx(part: string): string {
  return `${part.includes("r") ? "r" : "-"}${part.includes("w") ? "w" : "-"}${part.includes("x") ? "x" : "-"}`;
}

function modeToRwx(mode: number): string {
  const perm = mode & 0o777;
  const chunks = [(perm >> 6) & 0b111, (perm >> 3) & 0b111, perm & 0b111];
  return chunks
    .map((chunk) => `${chunk & 0b100 ? "r" : "-"}${chunk & 0b010 ? "w" : "-"}${chunk & 0b001 ? "x" : "-"}`)
    .join("");
}
