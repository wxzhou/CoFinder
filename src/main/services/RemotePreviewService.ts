import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import type { ConnectionManager } from "./ConnectionManager";
import type { RemoteErrorCode } from "../../shared/types/ipc";

type PreviewKind = "text" | "image";
type RemotePreviewClient = {
  stat: (remotePath: string) => Promise<{ type?: string | number; size?: number; modifyTime?: number }>;
  fastGet?: (remotePath: string, localPath: string) => Promise<unknown>;
  get?: (remotePath: string, localPath?: string) => Promise<unknown>;
};
type CacheEntry = {
  tabId: string;
  connectionId: string;
  remotePath: string;
  localPath: string;
  size: number;
  modifyTime: number;
  kind: PreviewKind;
};

export class RemotePreviewError extends Error {
  constructor(
    public readonly code: RemoteErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "RemotePreviewError";
  }
}

export class RemotePreviewService {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly cacheRoot: string
  ) {}

  async openPreview(request: {
    tabId: string;
    connectionId: string;
    remotePath: string;
  }): Promise<{ opened: true; localPath: string; kind: PreviewKind }> {
    const connection = this.connectionManager.getConnection(request.connectionId);
    if (!connection) throw new RemotePreviewError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const client = connection.client as unknown as RemotePreviewClient;
    const stat = await client.stat(request.remotePath).catch((error) => {
      throw mapRemotePreviewError(error, "Failed to inspect remote file.");
    });
    if (stat.type === "d" || stat.type === "directory" || stat.type === 2) {
      throw new RemotePreviewError("REMOTE_PREVIEW_UNSUPPORTED", "Remote preview supports files only.");
    }
    const size = stat.size ?? 0;
    const modifyTime = stat.modifyTime ?? 0;
    if (size > 25 * 1024 * 1024) {
      throw new RemotePreviewError("REMOTE_PREVIEW_UNSUPPORTED", "Remote preview supports files up to 25 MB in this version.");
    }

    const key = this.cacheKey(request.tabId, request.connectionId, request.remotePath);
    const existing = this.entries.get(key);
    if (existing && existing.size === size && existing.modifyTime === modifyTime && (await exists(existing.localPath))) {
      await openLocalPreview(existing.localPath);
      return { opened: true, localPath: existing.localPath, kind: existing.kind };
    }

    const localPath = await this.allocateLocalPath(request.tabId, request.remotePath);
    await downloadRemoteFile(client, request.remotePath, localPath);
    const sample = await readSample(localPath);
    const kind = sniffPreviewKind(sample);
    if (!kind) {
      await fs.unlink(localPath).catch(() => {});
      throw new RemotePreviewError("REMOTE_PREVIEW_UNSUPPORTED", "Remote preview supports sniffed text and common image files only.");
    }
    if (existing?.localPath && existing.localPath !== localPath) {
      await fs.unlink(existing.localPath).catch(() => {});
    }
    this.entries.set(key, {
      tabId: request.tabId,
      connectionId: request.connectionId,
      remotePath: request.remotePath,
      localPath,
      size,
      modifyTime,
      kind
    });
    await openLocalPreview(localPath);
    return { opened: true, localPath, kind };
  }

  async clearForTab(tabId: string): Promise<number> {
    return this.clear((entry) => entry.tabId === tabId);
  }

  async clearForConnection(connectionId: string): Promise<number> {
    return this.clear((entry) => entry.connectionId === connectionId);
  }

  async clearAll(): Promise<number> {
    return this.clear(() => true);
  }

  private async clear(predicate: (entry: CacheEntry) => boolean): Promise<number> {
    let cleared = 0;
    for (const [key, entry] of this.entries) {
      if (!predicate(entry)) continue;
      this.entries.delete(key);
      cleared += 1;
      await fs.unlink(entry.localPath).catch(() => {});
    }
    return cleared;
  }

  private cacheKey(tabId: string, connectionId: string, remotePath: string): string {
    return `${tabId}\u0000${connectionId}\u0000${remotePath}`;
  }

  private async allocateLocalPath(tabId: string, remotePath: string): Promise<string> {
    const tabHash = safeHash(tabId).slice(0, 12);
    const dir = path.join(this.cacheRoot, "remote-preview", tabHash);
    await fs.mkdir(dir, { recursive: true });
    const base = sanitizeFileName(path.posix.basename(remotePath) || "remote-file");
    return path.join(dir, `${safeHash(remotePath).slice(0, 16)}-${randomUUID().slice(0, 8)}-${base}`);
  }
}

async function downloadRemoteFile(client: RemotePreviewClient, remotePath: string, localPath: string): Promise<void> {
  if (typeof client.fastGet === "function") {
    await client.fastGet(remotePath, localPath);
    return;
  }
  if (typeof client.get === "function") {
    const result = await client.get(remotePath, localPath);
    if (Buffer.isBuffer(result)) await fs.writeFile(localPath, result);
    return;
  }
  throw new RemotePreviewError("REMOTE_PREVIEW_FAILED", "Remote preview download is unavailable for this connection.");
}

async function readSample(localPath: string): Promise<Buffer> {
  const handle = await fs.open(localPath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export function sniffPreviewKind(sample: Buffer): PreviewKind | null {
  if (isSupportedImage(sample)) return "image";
  if (isLikelyText(sample)) return "text";
  return null;
}

function isSupportedImage(sample: Buffer): boolean {
  if (sample.length >= 8 && sample.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff) return true;
  if (sample.length >= 6 && (sample.subarray(0, 6).toString("ascii") === "GIF87a" || sample.subarray(0, 6).toString("ascii") === "GIF89a")) return true;
  if (sample.length >= 12 && sample.subarray(0, 4).toString("ascii") === "RIFF" && sample.subarray(8, 12).toString("ascii") === "WEBP") return true;
  if (sample.length >= 4 && (sample.subarray(0, 4).toString("ascii") === "MM\u0000*" || sample.subarray(0, 4).toString("ascii") === "II*\u0000")) return true;
  return false;
}

function isLikelyText(sample: Buffer): boolean {
  if (sample.length === 0) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    const control = byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c;
    if (control) suspicious += 1;
  }
  return suspicious / sample.length < 0.02 && new TextDecoder("utf-8", { fatal: false }).decode(sample).length >= 0;
}

async function openLocalPreview(localPath: string): Promise<void> {
  const result = await shell.openPath(localPath);
  if (result) throw new RemotePreviewError("REMOTE_PREVIEW_FAILED", "Failed to open local preview file.", result);
}

async function exists(localPath: string): Promise<boolean> {
  try {
    await fs.access(localPath);
    return true;
  } catch {
    return false;
  }
}

function safeHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/:\\\u0000\r\n]/g, "_").slice(0, 160) || "remote-file";
}

function mapRemotePreviewError(error: unknown, fallback: string): RemotePreviewError {
  if (error instanceof RemotePreviewError) return error;
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : fallback;
  if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
    return new RemotePreviewError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
  }
  if (/EACCES|Permission denied/i.test(message)) {
    return new RemotePreviewError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
  }
  if (/Not connected|Connection lost|No response from server|Timed out|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return new RemotePreviewError("REMOTE_DISCONNECTED", "Remote connection lost. Please reconnect.", message);
  }
  return new RemotePreviewError("REMOTE_PREVIEW_FAILED", fallback, message);
}
