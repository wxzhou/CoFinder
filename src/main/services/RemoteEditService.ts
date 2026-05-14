import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConnectionManager } from "./ConnectionManager";
import { RemotePreviewError, sniffPreviewKind, darwinTextPreviewOpenArgs } from "./RemotePreviewService";
import {
  remoteEditSessionKey,
  type RemoteEditSession,
  type RemoteEditBaseline
} from "./RemoteEditSessionModel";

type RemoteEditClient = {
  stat: (remotePath: string) => Promise<{ type?: string | number; size?: number; modifyTime?: number }>;
  fastGet?: (remotePath: string, localPath: string) => Promise<unknown>;
  get?: (remotePath: string, localPath?: string) => Promise<unknown>;
};

export class RemoteEditService {
  private readonly sessions = new Map<string, RemoteEditSession>();

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly cacheRoot: string
  ) {}

  listSessions(): RemoteEditSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async openTextEditSession(
    request: { tabId: string; connectionId: string; remotePath: string },
    options: { textEditor?: string } = {}
  ): Promise<RemoteEditSession> {
    const connection = this.connectionManager.getConnection(request.connectionId);
    if (!connection) throw new RemotePreviewError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const client = connection.client as unknown as RemoteEditClient;
    const stat = await client.stat(request.remotePath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to inspect remote file.");
    });
    if (stat.type === "d" || stat.type === "directory" || stat.type === 2) {
      throw new RemotePreviewError("REMOTE_PREVIEW_UNSUPPORTED", "Remote edit supports files only.");
    }
    const baseline = remoteEditBaselineFromStat(stat);
    if (baseline.size > 5 * 1024 * 1024) {
      throw new RemotePreviewError("REMOTE_PREVIEW_UNSUPPORTED", "Remote edit supports text files up to 5 MB in this version.");
    }

    const key = remoteEditSessionKey(request.tabId, request.connectionId, request.remotePath);
    const existing = this.sessions.get(key);
    if (existing) {
      await openTextEditor(existing.localPath, options.textEditor);
      return existing;
    }

    const localPath = await this.allocateLocalPath(request.tabId, request.remotePath);
    await downloadRemoteFile(client, request.remotePath, localPath);
    const sample = await readSample(localPath);
    if (sniffPreviewKind(sample) !== "text") {
      await fs.unlink(localPath).catch(() => {});
      throw new RemotePreviewError("REMOTE_PREVIEW_UNSUPPORTED", "Remote edit supports sniffed text files only.");
    }
    await fs.chmod(localPath, 0o644).catch(() => {});
    const localStat = await fs.stat(localPath);
    const now = Date.now();
    const session: RemoteEditSession = {
      id: randomUUID(),
      tabId: request.tabId,
      connectionId: request.connectionId,
      remotePath: request.remotePath,
      localPath,
      baseline,
      lastLocalSize: localStat.size,
      lastLocalMtimeMs: localStat.mtimeMs,
      state: "clean",
      error: "",
      updatedAt: now
    };
    this.sessions.set(key, session);
    await openTextEditor(localPath, options.textEditor);
    return session;
  }

  private async allocateLocalPath(tabId: string, remotePath: string): Promise<string> {
    const dir = path.join(this.cacheRoot, "remote-edit", safeHash(tabId).slice(0, 12));
    await fs.mkdir(dir, { recursive: true });
    await fs.chmod(dir, 0o755).catch(() => {});
    const base = sanitizeFileName(path.posix.basename(remotePath) || "remote-file.txt");
    return path.join(dir, `${safeHash(remotePath).slice(0, 16)}-${randomUUID().slice(0, 8)}-${base}`);
  }
}

function remoteEditBaselineFromStat(stat: { size?: number; modifyTime?: number }): RemoteEditBaseline {
  return { size: stat.size ?? 0, modifyTime: stat.modifyTime ?? 0 };
}

async function downloadRemoteFile(client: RemoteEditClient, remotePath: string, localPath: string): Promise<void> {
  if (typeof client.fastGet === "function") {
    await client.fastGet(remotePath, localPath);
    return;
  }
  if (typeof client.get === "function") {
    const result = await client.get(remotePath, localPath);
    if (Buffer.isBuffer(result)) await fs.writeFile(localPath, result);
    return;
  }
  throw new RemotePreviewError("REMOTE_PREVIEW_FAILED", "Remote edit download is unavailable for this connection.");
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

async function openTextEditor(localPath: string, textEditor?: string): Promise<void> {
  if (process.platform !== "darwin") return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("open", darwinTextPreviewOpenArgs(localPath, textEditor), { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`open exited with ${code ?? "unknown"}`))));
  });
}

function safeHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/:\\\u0000\r\n]/g, "_").slice(0, 160) || "remote-file";
}

function mapRemoteEditError(error: unknown, fallback: string): RemotePreviewError {
  if (error instanceof RemotePreviewError) return error;
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : fallback;
  if (/No such file|ENOENT|no such path|does not exist/i.test(message)) {
    return new RemotePreviewError("REMOTE_NOT_FOUND", "Remote path does not exist.", message);
  }
  if (/EACCES|Permission denied/i.test(message)) {
    return new RemotePreviewError("REMOTE_PERMISSION_DENIED", "Permission denied on remote path.", message);
  }
  return new RemotePreviewError("REMOTE_PREVIEW_FAILED", fallback, message);
}
