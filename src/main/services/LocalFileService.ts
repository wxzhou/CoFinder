import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { shell } from "electron";
import type { LocalFileEntry } from "../../shared/types/models";
import type { LocalListDirectoryResponse, LocalErrorCode, PathInfo } from "../../shared/types/ipc";
import { normalizeLocalPath } from "../utils/pathSafety";
import { modeToRwx } from "./permissionDisplay";

const execFileAsync = promisify(execFile);
const localOwnerNameCache = new Map<number, string>();

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
        const uid = typeof (fileStats as { uid?: unknown }).uid === "number" ? (fileStats as { uid: number }).uid : undefined;

        return {
          name: dirent.name,
          fullPath,
          type: this.mapEntryType(dirent),
          size: fileStats.size,
          mtime: fileStats.mtime.toISOString(),
          permissions: modeToRwx(fileStats.mode),
          owner: uid !== undefined ? await resolveLocalOwnerName(uid) : undefined,
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

  async makeDirectory(parentPath: string, name: string): Promise<string> {
    const parent = normalizeLocalPath(parentPath);
    const childName = validateNewChildName(name);
    const targetPath = normalizeLocalPath(path.join(parent, childName));
    try {
      await fs.mkdir(targetPath);
      return targetPath;
    } catch (error) {
      throw this.mapCreateError(error, targetPath);
    }
  }

  async createTextFile(parentPath: string, name?: string): Promise<string> {
    const parent = normalizeLocalPath(parentPath);
    const targetPath = name?.trim()
      ? normalizeLocalPath(path.join(parent, validateNewChildName(name)))
      : await nextAvailableLocalTextFile(parent);
    try {
      await fs.writeFile(targetPath, "", { encoding: "utf8", flag: "wx" });
      return targetPath;
    } catch (error) {
      throw this.mapCreateError(error, targetPath);
    }
  }

  async compressFileGzip(targetPath: string, options?: { deleteSourceAfterSuccess?: boolean }): Promise<string> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const destinationPath = normalizeLocalPath(`${normalizedPath}.gz`);
    try {
      const stats = await fs.lstat(normalizedPath);
      if (!stats.isFile()) throw new LocalFileServiceError("COMPRESS_FAILED", "Only files can be compressed as gzip.");
      await pipeline(createReadStream(normalizedPath), createGzip(), createWriteStream(destinationPath, { flags: "wx" }));
      if (options?.deleteSourceAfterSuccess) await fs.rm(normalizedPath, { force: false });
      return destinationPath;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") await fs.rm(destinationPath, { force: true }).catch(() => {});
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapCompressError(error, normalizedPath);
    }
  }

  async touchPath(targetPath: string): Promise<void> {
    const normalizedPath = normalizeLocalPath(targetPath);
    try {
      await fs.lstat(normalizedPath);
      const now = new Date();
      await fs.utimes(normalizedPath, now, now);
    } catch (error) {
      throw this.mapTouchError(error, normalizedPath);
    }
  }

  async getPathInfo(targetPath: string, options?: { includeDirectorySize?: boolean }): Promise<PathInfo> {
    const normalizedPath = normalizeLocalPath(targetPath);
    try {
      const stats = await fs.lstat(normalizedPath);
      const type = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : stats.isSymbolicLink() ? "symlink" : "unknown";
      const size = type === "directory" && options?.includeDirectorySize !== false ? await this.getDirectorySize(normalizedPath) : stats.size;
      const counts = type === "directory" ? await directoryChildCounts(normalizedPath) : {};
      return {
        name: path.basename(normalizedPath),
        fullPath: normalizedPath,
        type,
        size,
        mtime: stats.mtime.toISOString(),
        permissions: modeToRwx(stats.mode),
        owner: typeof (stats as { uid?: unknown }).uid === "number" ? await resolveLocalOwnerName((stats as { uid: number }).uid) : undefined,
        group: typeof (stats as { gid?: unknown }).gid === "number" ? String((stats as { gid: number }).gid) : undefined,
        ...counts
      };
    } catch (error) {
      throw this.mapInfoError(error, normalizedPath);
    }
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

  private mapCreateError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Parent path not found: ${path.dirname(requestedPath)}`);
    if (code === "EACCES" || code === "EPERM") {
      return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    }
    if (code === "EEXIST") return new LocalFileServiceError("UNKNOWN", "A file or folder with the same name already exists.");
    return new LocalFileServiceError("UNKNOWN", `Failed to create path: ${requestedPath}`);
  }

  private mapInfoError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") {
      return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    }
    return new LocalFileServiceError("INFO_FAILED", `Failed to get path info: ${requestedPath}`);
  }

  private mapCompressError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    if (code === "EEXIST") return new LocalFileServiceError("COMPRESS_FAILED", "Gzip target already exists.");
    return new LocalFileServiceError("COMPRESS_FAILED", `Failed to compress path: ${requestedPath}`);
  }

  private mapTouchError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    return new LocalFileServiceError("TOUCH_FAILED", `Failed to touch path: ${requestedPath}`);
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const fullPath = normalizeLocalPath(path.join(dirPath, entry.name));
      const stats = await fs.lstat(fullPath);
      if (stats.isDirectory()) {
        total += await this.getDirectorySize(fullPath);
      } else {
        total += stats.size;
      }
    }
    return total;
  }
}

function validateNewChildName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\") || /[\u0000\r\n]/.test(trimmed)) {
    throw new LocalFileServiceError("UNKNOWN", "Name is invalid.");
  }
  return trimmed;
}

async function nextAvailableLocalTextFile(parentPath: string): Promise<string> {
  for (let i = 1; i < 1000; i += 1) {
    const name = i === 1 ? "Untitled.txt" : `Untitled ${i}.txt`;
    const candidate = normalizeLocalPath(path.join(parentPath, name));
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new LocalFileServiceError("UNKNOWN", "Could not find an available text file name.");
}

async function directoryChildCounts(dirPath: string): Promise<{ fileCount: number; folderCount: number }> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  let fileCount = 0;
  let folderCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) folderCount += 1;
    else fileCount += 1;
  }
  return { fileCount, folderCount };
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

async function resolveLocalOwnerName(uid: number): Promise<string> {
  const cached = localOwnerNameCache.get(uid);
  if (cached) return cached;
  try {
    const { stdout } = await execFileAsync("id", ["-nu", String(uid)]);
    const name = stdout.trim();
    if (name) {
      localOwnerNameCache.set(uid, name);
      return name;
    }
  } catch {
    // Fall back to the numeric uid when the local account database is unavailable.
  }
  const fallback = String(uid);
  localOwnerNameCache.set(uid, fallback);
  return fallback;
}
