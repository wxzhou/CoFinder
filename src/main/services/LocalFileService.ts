import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { shell } from "electron";
import type { LocalFileEntry } from "../../shared/types/models";
import type { FilePreviewReadResponse, LocalListDirectoryResponse, LocalErrorCode, PathInfo, TextContentReadResponse, TextSearchResponse } from "../../shared/types/ipc";
import { parseTimestampInput } from "../../shared/timestampInput";
import { normalizeLocalPath } from "../utils/pathSafety";
import { modeToRwx } from "./permissionDisplay";
import { sniffImageMimeType, sniffPreviewKind } from "./RemotePreviewService";

const execFileAsync = promisify(execFile);
const localOwnerNameCache = new Map<number, string>();
const DEFAULT_TEXT_READ_BYTES = 256 * 1024;
const TEXT_SNIFF_BYTES = 8192;
const DEFAULT_IMAGE_PREVIEW_BYTES = 12 * 1024 * 1024;
const DEFAULT_TEXT_SEARCH_MATCHES = 200;

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
    let destinationPath = normalizeLocalPath(`${normalizedPath}.gz`);
    try {
      const stats = await fs.lstat(normalizedPath);
      if (stats.isFile()) {
        await pipeline(createReadStream(normalizedPath), createGzip(), createWriteStream(destinationPath, { flags: "wx" }));
        if (options?.deleteSourceAfterSuccess) await fs.rm(normalizedPath, { force: false });
      } else if (stats.isDirectory()) {
        destinationPath = normalizeLocalPath(`${normalizedPath}.tar.gz`);
        await ensureLocalTargetAbsent(destinationPath);
        await execFileAsync("tar", ["-czf", destinationPath, "-C", path.dirname(normalizedPath), path.basename(normalizedPath)]);
        if (options?.deleteSourceAfterSuccess) await fs.rm(normalizedPath, { recursive: true, force: false });
      } else {
        throw new LocalFileServiceError("COMPRESS_FAILED", "Only files and folders can be compressed.");
      }
      return destinationPath;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") await fs.rm(destinationPath, { force: true }).catch(() => {});
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapCompressError(error, normalizedPath);
    }
  }

  async decompressPath(targetPath: string): Promise<string> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const destinationPath = localDecompressDestination(normalizedPath);
    try {
      await fs.lstat(normalizedPath);
      if (isTarGzipPath(normalizedPath)) {
        await ensureTarExtractionTargetsAbsent(normalizedPath);
        await execFileAsync("tar", ["-xzf", normalizedPath, "-C", path.dirname(normalizedPath)]);
      } else if (normalizedPath.endsWith(".gz")) {
        await pipeline(createReadStream(normalizedPath), createGunzip(), createWriteStream(destinationPath, { flags: "wx" }));
      } else {
        throw new LocalFileServiceError("COMPRESS_FAILED", "Selected item is not a supported compressed file.");
      }
      return destinationPath;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST" && normalizedPath.endsWith(".gz") && !isTarGzipPath(normalizedPath)) await fs.rm(destinationPath, { force: true }).catch(() => {});
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapDecompressError(error, normalizedPath);
    }
  }

  async generateMd5File(targetPath: string): Promise<string> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const destinationPath = normalizeLocalPath(`${normalizedPath}.md5`);
    try {
      const stats = await fs.lstat(normalizedPath);
      if (!stats.isFile()) throw new LocalFileServiceError("COMPRESS_FAILED", "Only files can have an MD5 sidecar generated.");
      const hash = await md5File(normalizedPath);
      await fs.writeFile(destinationPath, `${hash}  ${path.basename(normalizedPath)}\n`, { encoding: "utf8", flag: "wx" });
      return destinationPath;
    } catch (error) {
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapMd5Error(error, normalizedPath);
    }
  }

  async touchPath(targetPath: string, options?: { timestamp?: string }): Promise<void> {
    const normalizedPath = normalizeLocalPath(targetPath);
    try {
      await fs.lstat(normalizedPath);
      const timestamp = options?.timestamp ? parseTimestampInput(options.timestamp) : new Date();
      await fs.utimes(normalizedPath, timestamp, timestamp);
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

  async readTextFile(targetPath: string, options: { byteOffset?: number; maxBytes?: number } = {}): Promise<TextContentReadResponse> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const byteOffset = normalizeByteOffset(options.byteOffset);
    const maxBytes = normalizeTextReadLimit(options.maxBytes);
    try {
      const stats = await fs.lstat(normalizedPath);
      if (!stats.isFile()) throw new LocalFileServiceError("CONTENT_FAILED", "View Text supports files only.");
      const chunk = await readLocalFileChunk(normalizedPath, byteOffset, maxBytes);
      if (byteOffset === 0 && sniffPreviewKind(chunk.subarray(0, Math.min(TEXT_SNIFF_BYTES, chunk.length))) !== "text") {
        throw new LocalFileServiceError("CONTENT_FAILED", "Selected file does not look like text.");
      }
      const nextByteOffset = byteOffset + chunk.length;
      return {
        path: normalizedPath,
        content: chunk.toString("utf8"),
        byteOffset,
        nextByteOffset,
        size: stats.size,
        truncated: nextByteOffset < stats.size
      };
    } catch (error) {
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapContentError(error, normalizedPath);
    }
  }

  async readPreviewFile(targetPath: string, options: { maxTextBytes?: number; maxImageBytes?: number } = {}): Promise<FilePreviewReadResponse> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const maxTextBytes = normalizeTextReadLimit(options.maxTextBytes);
    const maxImageBytes = normalizeImagePreviewLimit(options.maxImageBytes);
    try {
      const stats = await fs.lstat(normalizedPath);
      if (!stats.isFile()) throw new LocalFileServiceError("CONTENT_FAILED", "Preview supports files only.");
      const size = stats.size;
      const initialBytes = Math.min(Math.max(TEXT_SNIFF_BYTES, maxTextBytes), Math.max(size, 0));
      const initialChunk = await readLocalFileChunk(normalizedPath, 0, initialBytes);
      const sample = initialChunk.subarray(0, Math.min(TEXT_SNIFF_BYTES, initialChunk.length));
      const kind = sniffPreviewKind(sample);
      if (kind === "text") {
        const content = initialChunk.subarray(0, maxTextBytes).toString("utf8");
        return { path: normalizedPath, kind: "text", size, content, truncated: maxTextBytes < size };
      }
      if (kind === "image") {
        if (size > maxImageBytes) {
          throw new LocalFileServiceError("CONTENT_FAILED", `Image preview supports files up to ${formatPreviewLimit(maxImageBytes)}.`);
        }
        const imageBytes = initialChunk.length >= size ? initialChunk.subarray(0, size) : await readLocalFileChunk(normalizedPath, 0, size);
        const mimeType = sniffImageMimeType(imageBytes.subarray(0, Math.min(TEXT_SNIFF_BYTES, imageBytes.length))) ?? "application/octet-stream";
        return {
          path: normalizedPath,
          kind: "image",
          size,
          mimeType,
          imageDataUrl: `data:${mimeType};base64,${imageBytes.toString("base64")}`,
          truncated: false
        };
      }
      throw new LocalFileServiceError("CONTENT_FAILED", "Selected file does not look like previewable text or image.");
    } catch (error) {
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapContentError(error, normalizedPath);
    }
  }

  async searchText(targetPath: string, query: string, options: { maxMatches?: number } = {}): Promise<TextSearchResponse> {
    const normalizedPath = normalizeLocalPath(targetPath);
    const trimmedQuery = query.trim();
    const maxMatches = normalizeSearchMatchLimit(options.maxMatches);
    if (!trimmedQuery) throw new LocalFileServiceError("CONTENT_FAILED", "Search query is required.");
    try {
      const stats = await fs.lstat(normalizedPath);
      if (!stats.isFile() && !stats.isDirectory()) throw new LocalFileServiceError("CONTENT_FAILED", "Search Contents supports files and folders only.");
      const result = await runLocalTextSearch(normalizedPath, trimmedQuery, stats.isDirectory(), maxMatches);
      return {
        query: trimmedQuery,
        rootPath: normalizedPath,
        matches: result.matches,
        truncated: result.truncated,
        tool: result.tool
      };
    } catch (error) {
      if (error instanceof LocalFileServiceError) throw error;
      throw this.mapContentError(error, normalizedPath);
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

  private mapContentError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    return new LocalFileServiceError("CONTENT_FAILED", `Failed to read local text file: ${requestedPath}`);
  }

  private mapCompressError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    if (code === "EEXIST") return new LocalFileServiceError("COMPRESS_FAILED", "Gzip target already exists.");
    return new LocalFileServiceError("COMPRESS_FAILED", `Failed to compress path: ${requestedPath}`);
  }

  private mapDecompressError(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    if (code === "EEXIST") return new LocalFileServiceError("COMPRESS_FAILED", "Decompress target already exists.");
    return new LocalFileServiceError("COMPRESS_FAILED", `Failed to decompress path: ${requestedPath}`);
  }

  private mapMd5Error(error: unknown, requestedPath: string): LocalFileServiceError {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return new LocalFileServiceError("NOT_FOUND", `Path not found: ${requestedPath}`);
    if (code === "EACCES" || code === "EPERM") return new LocalFileServiceError("PERMISSION_DENIED", `Permission denied: ${requestedPath}`);
    if (code === "EEXIST") return new LocalFileServiceError("COMPRESS_FAILED", "MD5 target already exists.");
    return new LocalFileServiceError("COMPRESS_FAILED", `Failed to generate MD5 for path: ${requestedPath}`);
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

function isTarGzipPath(input: string): boolean {
  return input.endsWith(".tar.gz") || input.endsWith(".tgz");
}

function localDecompressDestination(input: string): string {
  if (input.endsWith(".tar.gz")) return input.slice(0, -7);
  if (input.endsWith(".tgz")) return input.slice(0, -4);
  if (input.endsWith(".gz")) return input.slice(0, -3);
  throw new LocalFileServiceError("COMPRESS_FAILED", "Selected item is not a supported compressed file.");
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

function normalizeImagePreviewLimit(value: unknown): number {
  const numeric = typeof value === "number" ? value : DEFAULT_IMAGE_PREVIEW_BYTES;
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_IMAGE_PREVIEW_BYTES;
  return Math.min(Math.floor(numeric), DEFAULT_IMAGE_PREVIEW_BYTES);
}

function formatPreviewLimit(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function normalizeSearchMatchLimit(value: unknown): number {
  const numeric = typeof value === "number" ? value : DEFAULT_TEXT_SEARCH_MATCHES;
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TEXT_SEARCH_MATCHES;
  return Math.min(Math.floor(numeric), DEFAULT_TEXT_SEARCH_MATCHES);
}

async function readLocalFileChunk(targetPath: string, byteOffset: number, maxBytes: number): Promise<Buffer> {
  if (maxBytes <= 0) return Buffer.alloc(0);
  const handle = await fs.open(targetPath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, byteOffset);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

async function runLocalTextSearch(
  targetPath: string,
  query: string,
  isDirectory: boolean,
  maxMatches: number
): Promise<{ matches: TextSearchResponse["matches"]; truncated: boolean; tool: "rg" | "grep" }> {
  try {
    const output = await execSearchCommand("rg", ["--line-number", "--with-filename", "--fixed-strings", "--no-heading", "--color", "never", "--", query, targetPath]);
    return parseSearchOutput(output, maxMatches, "rg");
  } catch (error) {
    if (!isCommandMissing(error)) {
      const output = execErrorOutput(error);
      if (output !== "") return parseSearchOutput(output, maxMatches, "rg");
      if (isNoMatchesExit(error)) return { matches: [], truncated: false, tool: "rg" };
    }
  }
  const grepArgs = isDirectory
    ? ["-R", "-n", "-H", "-F", "--", query, targetPath]
    : ["-n", "-H", "-F", "--", query, targetPath];
  try {
    const output = await execSearchCommand("grep", grepArgs);
    return parseSearchOutput(output, maxMatches, "grep");
  } catch (error) {
    const output = execErrorOutput(error);
    if (output !== "") return parseSearchOutput(output, maxMatches, "grep");
    if (isNoMatchesExit(error)) return { matches: [], truncated: false, tool: "grep" };
    throw error;
  }
}

async function execSearchCommand(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
  return stdout;
}

function parseSearchOutput(output: string, maxMatches: number, tool: "rg" | "grep"): { matches: TextSearchResponse["matches"]; truncated: boolean; tool: "rg" | "grep" } {
  const matches: TextSearchResponse["matches"] = [];
  const lines = output.split(/\r?\n/).filter(Boolean);
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

function execErrorOutput(error: unknown): string {
  const maybe = error as { stdout?: unknown };
  return typeof maybe.stdout === "string" ? maybe.stdout : "";
}

function isCommandMissing(error: unknown): boolean {
  const maybe = error as { code?: unknown };
  return maybe.code === "ENOENT";
}

function isNoMatchesExit(error: unknown): boolean {
  const maybe = error as { code?: unknown };
  return maybe.code === 1;
}

async function ensureLocalTargetAbsent(targetPath: string): Promise<void> {
  try {
    await fs.lstat(targetPath);
    throw new LocalFileServiceError("COMPRESS_FAILED", "Target already exists.");
  } catch (error) {
    if (error instanceof LocalFileServiceError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
  }
}

async function ensureTarExtractionTargetsAbsent(archivePath: string): Promise<void> {
  const { stdout } = await execFileAsync("tar", ["-tzf", archivePath]);
  const parent = path.dirname(archivePath);
  const topLevel = new Set(
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\.\//, "").split("/").filter(Boolean)[0])
      .filter(Boolean)
  );
  for (const name of topLevel) await ensureLocalTargetAbsent(path.join(parent, name));
}

async function md5File(filePath: string): Promise<string> {
  const hash = createHash("md5");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
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
