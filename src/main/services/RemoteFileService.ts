import path from "node:path";
import type { ConnectionConfig, RemoteFileEntry } from "../../shared/types/models";
import type { RemoteConnectResponse, RemoteErrorCode, RemoteListDirectoryResponse } from "../../shared/types/ipc";
import { ConnectionManager } from "./ConnectionManager";

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
    if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
      throw new RemoteServiceError("REMOTE_INVALID_INPUT", "Port must be between 1 and 65535.");
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

  private normalizeRemotePath(inputPath: string): string {
    const source = inputPath.trim() || "/";
    const normalized = posixPath.normalize(source);
    if (normalized === ".") return "/";
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
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
