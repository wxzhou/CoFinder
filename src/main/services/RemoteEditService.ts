import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConnectionManager } from "./ConnectionManager";
import { RemotePreviewError, sniffPreviewKind, darwinTextPreviewOpenArgs } from "./RemotePreviewService";
import {
  remoteEditRemoteChanged,
  remoteEditSessionKey,
  transitionRemoteEditSession,
  type RemoteEditSession,
  type RemoteEditBaseline
} from "./RemoteEditSessionModel";

type RemoteEditClient = {
  stat: (remotePath: string) => Promise<{ type?: string | number; size?: number; modifyTime?: number }>;
  fastGet?: (remotePath: string, localPath: string) => Promise<unknown>;
  get?: (remotePath: string, localPath?: string) => Promise<unknown>;
  put?: (localPath: string, remotePath: string) => Promise<unknown>;
};

export class RemoteEditService {
  private readonly sessions = new Map<string, RemoteEditSession>();
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly uploads = new Map<string, Promise<RemoteEditSession>>();
  private readonly pendingUploads = new Set<string>();

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly cacheRoot: string,
    private readonly onSessionChange: (session: RemoteEditSession) => void = () => {}
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
      this.startWatcher(existing);
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
    this.onSessionChange(session);
    this.startWatcher(session);
    await openTextEditor(localPath, options.textEditor);
    return session;
  }

  async syncSession(sessionId: string): Promise<RemoteEditSession> {
    const running = this.uploads.get(sessionId);
    if (running) {
      this.pendingUploads.add(sessionId);
      return running;
    }
    const upload = this.syncSessionNow(sessionId)
      .catch((error) => {
        const message = error instanceof RemotePreviewError ? error.message : error instanceof Error ? error.message : "Remote edit upload failed.";
        try {
          return this.replaceSession(sessionId, { state: "failed", error: message });
        } catch {
          throw error;
        }
      })
      .finally(() => {
        this.uploads.delete(sessionId);
        if (this.pendingUploads.delete(sessionId)) {
          void this.syncSession(sessionId);
        }
      });
    this.uploads.set(sessionId, upload);
    return upload;
  }

  closeAll(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    for (const watcher of this.watchers.values()) watcher.close();
    this.debounceTimers.clear();
    this.watchers.clear();
    this.uploads.clear();
    this.pendingUploads.clear();
    this.sessions.clear();
  }

  getSession(sessionId: string): RemoteEditSession | null {
    return this.findSessionById(sessionId);
  }

  async redownloadSession(sessionId: string): Promise<RemoteEditSession> {
    const session = this.requireSession(sessionId);
    const connection = this.connectionManager.getConnection(session.connectionId);
    if (!connection) throw new RemotePreviewError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const client = connection.client as unknown as RemoteEditClient;
    const stat = await client.stat(session.remotePath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to inspect remote file before re-download.");
    });
    await downloadRemoteFile(client, session.remotePath, session.localPath);
    const localStat = await fs.stat(session.localPath);
    return this.replaceSession(sessionId, {
      state: "clean",
      error: "",
      baseline: remoteEditBaselineFromStat(stat),
      lastLocalSize: localStat.size,
      lastLocalMtimeMs: localStat.mtimeMs
    });
  }

  async forceUploadSession(sessionId: string): Promise<RemoteEditSession> {
    const session = this.requireSession(sessionId);
    const connection = this.connectionManager.getConnection(session.connectionId);
    if (!connection) throw new RemotePreviewError("REMOTE_DISCONNECTED", "Remote connection has been disconnected.");
    const client = connection.client as unknown as RemoteEditClient;
    if (typeof client.put !== "function") {
      return this.replaceSession(sessionId, { state: "failed", error: "Remote edit upload is unavailable for this connection." });
    }
    const localStat = await fs.stat(session.localPath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to inspect local edit copy.");
    });
    this.replaceSession(sessionId, { state: "uploading", error: "" });
    await client.put(session.localPath, session.remotePath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to upload edited remote file.");
    });
    const nextRemoteStat = await client.stat(session.remotePath).catch(() => ({ size: localStat.size, modifyTime: Date.now() }));
    return this.replaceSession(sessionId, {
      state: "uploaded",
      error: "",
      baseline: remoteEditBaselineFromStat(nextRemoteStat),
      lastLocalSize: localStat.size,
      lastLocalMtimeMs: localStat.mtimeMs,
      lastUploadedAt: Date.now()
    });
  }

  async closeSession(sessionId: string, options: { discardLocal?: boolean } = {}): Promise<void> {
    const session = this.requireSession(sessionId);
    const timer = this.debounceTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.debounceTimers.delete(sessionId);
    this.pendingUploads.delete(sessionId);
    this.watchers.get(sessionId)?.close();
    this.watchers.delete(sessionId);
    for (const [key, value] of this.sessions) {
      if (value.id === sessionId) this.sessions.delete(key);
    }
    if (options.discardLocal !== false) await fs.unlink(session.localPath).catch(() => {});
  }

  private async allocateLocalPath(tabId: string, remotePath: string): Promise<string> {
    const dir = path.join(this.cacheRoot, "remote-edit", safeHash(tabId).slice(0, 12));
    await fs.mkdir(dir, { recursive: true });
    await fs.chmod(dir, 0o755).catch(() => {});
    const base = sanitizeFileName(path.posix.basename(remotePath) || "remote-file.txt");
    return path.join(dir, `${safeHash(remotePath).slice(0, 16)}-${randomUUID().slice(0, 8)}-${base}`);
  }

  private startWatcher(session: RemoteEditSession): void {
    if (this.watchers.has(session.id)) return;
    const dir = path.dirname(session.localPath);
    const basename = path.basename(session.localPath);
    const watcher = watch(dir, (eventType, filename) => {
      if (filename && filename.toString() !== basename) return;
      if (eventType !== "change" && eventType !== "rename") return;
      this.scheduleSync(session.id);
    });
    watcher.on("error", () => {
      this.replaceSession(session.id, { state: "failed", error: "Failed to watch local edit copy for saves." });
    });
    this.watchers.set(session.id, watcher);
  }

  private scheduleSync(sessionId: string): void {
    const existing = this.debounceTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(sessionId);
      void this.syncSession(sessionId).catch(() => {});
    }, 600);
    this.debounceTimers.set(sessionId, timer);
  }

  private async syncSessionNow(sessionId: string): Promise<RemoteEditSession> {
    const session = this.findSessionById(sessionId);
    if (!session) throw new RemotePreviewError("REMOTE_NOT_FOUND", "Remote edit session no longer exists.");
    const localStat = await fs.stat(session.localPath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to inspect local edit copy.");
    });
    const shouldRetry = session.state === "dirty" || session.state === "failed" || session.state === "conflict";
    if (!shouldRetry && localStat.size === session.lastLocalSize && localStat.mtimeMs === session.lastLocalMtimeMs) return session;

    this.replaceSession(sessionId, {
      state: "dirty",
      error: "",
      lastLocalSize: localStat.size,
      lastLocalMtimeMs: localStat.mtimeMs
    });

    const connection = this.connectionManager.getConnection(session.connectionId);
    if (!connection) {
      return this.replaceSession(sessionId, { state: "failed", error: "Remote connection has been disconnected." });
    }
    const client = connection.client as unknown as RemoteEditClient;
    if (typeof client.put !== "function") {
      return this.replaceSession(sessionId, { state: "failed", error: "Remote edit upload is unavailable for this connection." });
    }

    const remoteStat = await client.stat(session.remotePath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to inspect remote file before upload.");
    });
    const remoteBaseline = remoteEditBaselineFromStat(remoteStat);
    if (remoteEditRemoteChanged(session.baseline, remoteBaseline)) {
      return this.replaceSession(sessionId, {
        state: "conflict",
        error: "Remote file changed after this edit session started. Local edits were not uploaded."
      });
    }

    this.replaceSession(sessionId, { state: "uploading", error: "" });
    await client.put(session.localPath, session.remotePath).catch((error) => {
      throw mapRemoteEditError(error, "Failed to upload edited remote file.");
    });
    const nextRemoteStat = await client.stat(session.remotePath).catch(() => ({ size: localStat.size, modifyTime: Date.now() }));
    return this.replaceSession(sessionId, {
      state: "uploaded",
      error: "",
      baseline: remoteEditBaselineFromStat(nextRemoteStat),
      lastLocalSize: localStat.size,
      lastLocalMtimeMs: localStat.mtimeMs,
      lastUploadedAt: Date.now()
    });
  }

  private findSessionById(sessionId: string): RemoteEditSession | null {
    return this.listSessions().find((session) => session.id === sessionId) ?? null;
  }

  private requireSession(sessionId: string): RemoteEditSession {
    const session = this.findSessionById(sessionId);
    if (!session) throw new RemotePreviewError("REMOTE_NOT_FOUND", "Remote edit session no longer exists.");
    return session;
  }

  private replaceSession(
    sessionId: string,
    patch: Partial<Pick<RemoteEditSession, "state" | "error" | "baseline" | "lastLocalSize" | "lastLocalMtimeMs" | "lastUploadedAt">>
  ): RemoteEditSession {
    for (const [key, session] of this.sessions) {
      if (session.id !== sessionId) continue;
      const next = transitionRemoteEditSession(session, patch);
      this.sessions.set(key, next);
      this.onSessionChange(next);
      return next;
    }
    throw new RemotePreviewError("REMOTE_NOT_FOUND", "Remote edit session no longer exists.");
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
