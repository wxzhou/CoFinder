import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { shell } from "electron";
import type { LocalFileEntry } from "../../shared/types/models";
import type { LocalListDirectoryResponse, LocalErrorCode } from "../../shared/types/ipc";
import { normalizeLocalPath } from "../utils/pathSafety";

class LocalFileServiceError extends Error {
  constructor(
    public readonly code: LocalErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LocalFileServiceError";
  }
}

export class LocalFileService {
  async listDirectory(inputPath: string): Promise<LocalListDirectoryResponse> {
    const requestedPath = inputPath.trim() || os.homedir();
    const normalizedPath = normalizeLocalPath(requestedPath);

    let stats;
    try {
      stats = await fs.stat(normalizedPath);
    } catch (error) {
      throw this.mapFsError(error, normalizedPath);
    }

    if (!stats.isDirectory()) {
      throw new LocalFileServiceError("NOT_DIRECTORY", `Path is not a directory: ${normalizedPath}`);
    }

    let dirEntries;
    try {
      dirEntries = await fs.readdir(normalizedPath, { withFileTypes: true });
    } catch (error) {
      throw this.mapFsError(error, normalizedPath);
    }

    const entries = await Promise.all(
      dirEntries.map(async (dirent): Promise<LocalFileEntry> => {
        const fullPath = normalizeLocalPath(path.join(normalizedPath, dirent.name));
        const fileStats = await fs.lstat(fullPath);

        return {
          name: dirent.name,
          fullPath,
          type: this.mapEntryType(dirent),
          size: fileStats.size,
          mtime: fileStats.mtime.toISOString(),
          permissions: (fileStats.mode & 0o777).toString(8).padStart(3, "0"),
          isHidden: dirent.name.startsWith(".")
        };
      })
    );

    return { path: normalizedPath, entries };
  }

  async openPath(targetPath: string): Promise<void> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const result = await shell.openPath(normalizedPath);
    if (result) {
      throw new LocalFileServiceError("OPEN_FAILED", result);
    }
  }

  async revealPath(targetPath: string): Promise<void> {
    const normalizedPath = normalizeLocalPath(targetPath);
    shell.showItemInFolder(normalizedPath);
  }

  async renamePath(targetPath: string, newName: string): Promise<string> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === "." || trimmedName === "..") {
      throw new LocalFileServiceError("RENAME_FAILED", "New name is invalid.");
    }
    if (trimmedName.includes("/") || trimmedName.includes("\\")) {
      throw new LocalFileServiceError("RENAME_FAILED", "New name cannot contain path separators.");
    }

    const destinationPath = normalizeLocalPath(path.join(path.dirname(normalizedPath), trimmedName));
    if (destinationPath === normalizedPath) return normalizedPath;
    try {
      await fs.stat(destinationPath);
      throw new LocalFileServiceError("RENAME_FAILED", "A file or folder with the same name already exists.");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (error instanceof LocalFileServiceError) throw error;
      if (code && code !== "ENOENT") throw this.mapRenameError(error, normalizedPath);
    }
    try {
      await fs.rename(normalizedPath, destinationPath);
      return destinationPath;
    } catch (error) {
      throw this.mapRenameError(error, normalizedPath);
    }
  }

  async deletePaths(paths: string[]): Promise<number> {
    if (paths.length === 0) {
      throw new LocalFileServiceError("DELETE_FAILED", "Select at least one local path to delete.");
    }
    const normalized = unique(paths.map((item) => normalizeLocalPath(item)));
    let deleted = 0;
    for (const targetPath of normalized) {
      try {
        await fs.rm(targetPath, { recursive: true, force: false });
        deleted += 1;
      } catch (error) {
        throw this.mapDeleteError(error, targetPath);
      }
    }
    return deleted;
  }

  private mapEntryType(dirent: { isDirectory: () => boolean; isFile: () => boolean; isSymbolicLink: () => boolean }) {
    if (dirent.isDirectory()) return "directory";
    if (dirent.isFile()) return "file";
    if (dirent.isSymbolicLink()) return "symlink";
    return "unknown";
  }

  private mapFsError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") {
      return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    }
    return new LocalFileServiceError("UNKNOWN", `Failed to access path: ${requestedPath}`);
  }

  private mapRenameError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") {
      return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    }
    if (code === "EEXIST") {
      return new LocalFileServiceError("RENAME_FAILED", "A file or folder with the same name already exists.");
    }
    return new LocalFileServiceError("RENAME_FAILED", `Failed to rename path: ${requestedPath}`);
  }

  private mapDeleteError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") {
      return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    }
    return new LocalFileServiceError("DELETE_FAILED", `Failed to delete path: ${requestedPath}`);
  }
}

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
