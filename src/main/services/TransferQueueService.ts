import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { posix as posixPath } from "node:path";
import type { EnqueueDownloadRequest, EnqueueUploadRequest, TransferUpdatePayload } from "../../shared/types/ipc";
import type { TransferTask } from "../../shared/types/models";

type TransferServiceErrorCode = "TRANSFER_INVALID_REQUEST" | "TRANSFER_PRECHECK_FAILED" | "TRANSFER_NOT_FOUND" | "TRANSFER_NOT_RUNNING";
type TransferServiceError = Error & { code: TransferServiceErrorCode; detail?: string };

const SAFE_REMOTE_PATH = /^[A-Za-z0-9._/\-@+=,: ]+$/;
const SAFE_HOST_USER = /^[A-Za-z0-9._-]+$/;

type RunningContext = {
  taskId: string;
  child: ChildProcess;
};

export class TransferQueueService {
  private tasks: TransferTask[] = [];
  private running: RunningContext | null = null;
  private listeners = new Set<(payload: TransferUpdatePayload) => void>();

  onUpdate(listener: (payload: TransferUpdatePayload) => void): () => void {
    this.listeners.add(listener);
    listener({ tasks: this.snapshot() });
    return () => this.listeners.delete(listener);
  }

  list(): TransferTask[] {
    return this.snapshot();
  }

  async enqueueUpload(request: EnqueueUploadRequest): Promise<{ queued: true; taskIds: string[] }> {
    validateCommonRequest(request);
    if (request.localSources.length === 0) throw transferError("TRANSFER_INVALID_REQUEST", "Select at least one local file to upload.");
    await ensureDirExists(request.remoteDestinationDir, "Remote destination");
    await this.ensureRsyncInstalled();
    await this.ensureBatchModeLogin(request);

    const taskIds: string[] = [];
    for (const source of request.localSources) {
      validateLocalPath(source);
      await ensurePathExists(source);
      const sourceName = path.basename(source);
      const remotePath = normalizeRemotePath(posixPath.join(request.remoteDestinationDir, sourceName));
      const task = this.makeTask({
        tabId: request.tabId,
        direction: "upload",
        profileId: request.profileId,
        connectionId: request.connectionId,
        host: request.host,
        port: request.port,
        username: request.username,
        source,
        destination: remotePath,
        sourceDisplay: source,
        destinationDisplay: `${request.username}@${request.host}:${remotePath}`,
        localPath: source,
        remotePath
      });
      this.tasks.push(task);
      taskIds.push(task.id);
    }
    this.emit();
    void this.pump();
    return { queued: true, taskIds };
  }

  async enqueueDownload(request: EnqueueDownloadRequest): Promise<{ queued: true; taskIds: string[] }> {
    validateCommonRequest(request);
    if (request.remoteSources.length === 0) {
      throw transferError("TRANSFER_INVALID_REQUEST", "Select at least one remote file to download.");
    }
    validateLocalPath(request.localDestinationDir);
    await ensurePathExists(request.localDestinationDir);
    await this.ensureRsyncInstalled();
    await this.ensureBatchModeLogin(request);

    const taskIds: string[] = [];
    for (const source of request.remoteSources) {
      const remotePath = normalizeRemotePath(source);
      const sourceName = posixPath.basename(remotePath);
      const localPath = path.join(request.localDestinationDir, sourceName);
      const task = this.makeTask({
        tabId: request.tabId,
        direction: "download",
        profileId: request.profileId,
        connectionId: request.connectionId,
        host: request.host,
        port: request.port,
        username: request.username,
        source: remotePath,
        destination: localPath,
        sourceDisplay: `${request.username}@${request.host}:${remotePath}`,
        destinationDisplay: localPath,
        localPath: request.localDestinationDir,
        remotePath
      });
      this.tasks.push(task);
      taskIds.push(task.id);
    }
    this.emit();
    void this.pump();
    return { queued: true, taskIds };
  }

  async cancel(taskId: string): Promise<{ canceled: true }> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) throw transferError("TRANSFER_NOT_FOUND", "Transfer task not found.");
    if (task.status !== "pending") throw transferError("TRANSFER_INVALID_REQUEST", "Only pending task can be canceled.");
    task.status = "canceled";
    task.finishedAt = Date.now();
    this.appendLog(task, "Task canceled before execution.");
    this.emit();
    return { canceled: true };
  }

  async stop(taskId: string): Promise<{ stopped: true }> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) throw transferError("TRANSFER_NOT_FOUND", "Transfer task not found.");
    if (!this.running || this.running.taskId !== taskId || task.status !== "running") {
      throw transferError("TRANSFER_NOT_RUNNING", "Task is not running.");
    }
    this.running.child.kill("SIGTERM");
    return { stopped: true };
  }

  clearCompleted(): { cleared: number } {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.status === "running" || task.status === "pending");
    const cleared = before - this.tasks.length;
    if (cleared > 0) this.emit();
    return { cleared };
  }

  private makeTask(input: Omit<TransferTask, "id" | "status" | "rawLog" | "createdAt">): TransferTask {
    return {
      id: randomUUID(),
      status: "pending",
      rawLog: [],
      createdAt: Date.now(),
      ...input
    };
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const next = this.tasks.find((task) => task.status === "pending");
    if (!next) return;
    await this.runTask(next);
    void this.pump();
  }

  private async runTask(task: TransferTask): Promise<void> {
    task.status = "running";
    task.startedAt = Date.now();
    task.error = undefined;
    this.emit();

    const sshSpec = `ssh -p ${task.port} -o BatchMode=yes`;
    const remoteSpec = buildRsyncRemoteSpec(task.username, task.host, task.remotePath);
    const args =
      task.direction === "upload"
        ? ["-avh", "--progress", "-e", sshSpec, task.localPath, remoteSpec]
        : ["-avh", "--progress", "-e", sshSpec, remoteSpec, task.localPath];

    // Directory transfer rule: source path does not get trailing slash, so rsync keeps the directory itself.
    const child = spawn("rsync", args, { stdio: ["ignore", "pipe", "pipe"] });
    this.running = { taskId: task.id, child };

    await new Promise<void>((resolve) => {
      child.stdout.on("data", (chunk: Buffer) => {
        for (const raw of chunk.toString("utf8").split(/\r?\n/)) {
          if (!raw.trim()) continue;
          this.consumeProgressLine(task, raw.trim());
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        for (const raw of chunk.toString("utf8").split(/\r?\n/)) {
          if (!raw.trim()) continue;
          this.consumeProgressLine(task, raw.trim());
        }
      });
      child.on("error", (error) => {
        task.status = "failed";
        task.finishedAt = Date.now();
        task.error = (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "rsync is not installed or not found in PATH"
          : "Failed to start rsync process.";
        this.appendLog(task, task.error);
        this.running = null;
        this.emit();
        resolve();
      });
      child.on("close", (code, signal) => {
        task.finishedAt = Date.now();
        if (task.status === "stopped") {
          this.appendLog(task, `Stopped by signal ${signal ?? "SIGTERM"}.`);
        } else if (signal) {
          task.status = "stopped";
          task.error = "Transfer stopped by user.";
          this.appendLog(task, task.error);
        } else if (code === 0) {
          task.status = "success";
          this.appendLog(task, "Transfer completed successfully.");
        } else {
          task.status = "failed";
          task.error = `rsync exited with code ${code ?? -1}.`;
          this.appendLog(task, task.error);
        }
        this.running = null;
        this.emit();
        resolve();
      });
    });
  }

  private consumeProgressLine(task: TransferTask, line: string): void {
    const safeLine = line.slice(0, 400);
    this.appendLog(task, safeLine);
    const fileHint = safeLine.match(/to-check=\d+\/\d+\)\s*(.+)$/);
    if (fileHint && fileHint[1]) task.currentFile = fileHint[1];

    const progress = safeLine.match(/(\d+)%\s+([0-9.]+\w+\/s)\s+(\d+:\d+:\d+|\d+:\d+)/);
    if (progress) {
      task.percent = Number(progress[1]);
      task.speed = progress[2];
      task.eta = progress[3];
      task.progressText = safeLine;
      this.emit();
      return;
    }
    if (/\d+%/.test(safeLine) || /xfr#\d+/.test(safeLine) || /to-check=/.test(safeLine)) {
      task.progressText = safeLine;
      this.emit();
    }
  }

  private appendLog(task: TransferTask, line: string): void {
    task.rawLog = [...task.rawLog.slice(-199), line];
  }

  private emit(): void {
    const payload: TransferUpdatePayload = { tasks: this.snapshot() };
    for (const listener of this.listeners) listener(payload);
  }

  private snapshot(): TransferTask[] {
    return this.tasks.map((task) => ({
      ...task,
      rawLog: [...task.rawLog]
    }));
  }

  private async ensureRsyncInstalled(): Promise<void> {
    await runSimpleCommand("rsync", ["--version"], "rsync is not installed or not found in PATH");
  }

  private async ensureBatchModeLogin(request: {
    host: string;
    port: number;
    username: string;
    authType?: "password" | "privateKey";
  }): Promise<void> {
    const result = await runSimpleCommand(
      "ssh",
      ["-o", "BatchMode=yes", "-p", String(request.port), `${request.username}@${request.host}`, "true"],
      "SSH key/passwordless login required for rsync transfer."
    );
    if (!result.ok) {
      throw transferError("TRANSFER_PRECHECK_FAILED", result.message, result.detail);
    }
  }
}

async function ensurePathExists(fullPath: string): Promise<void> {
  try {
    await fs.stat(fullPath);
  } catch {
    throw transferError("TRANSFER_INVALID_REQUEST", `Path not found: ${fullPath}`);
  }
}

async function ensureDirExists(posixTarget: string, label: string): Promise<void> {
  if (!normalizeRemotePath(posixTarget)) {
    throw transferError("TRANSFER_INVALID_REQUEST", `${label} is required.`);
  }
}

function validateCommonRequest(request: {
  tabId: string;
  host: string;
  port: number;
  username: string;
}): void {
  if (!request.tabId.trim()) throw transferError("TRANSFER_INVALID_REQUEST", "Tab id is required.");
  if (!SAFE_HOST_USER.test(request.host)) throw transferError("TRANSFER_INVALID_REQUEST", "Invalid host for rsync transfer.");
  if (!SAFE_HOST_USER.test(request.username)) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Invalid username for rsync transfer.");
  }
  if (!Number.isInteger(request.port) || request.port <= 0 || request.port > 65535) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Port must be between 1 and 65535.");
  }
}

function validateLocalPath(fullPath: string): void {
  if (!fullPath?.trim()) throw transferError("TRANSFER_INVALID_REQUEST", "Path is required.");
  if (/\u0000|\n|\r/.test(fullPath)) throw transferError("TRANSFER_INVALID_REQUEST", "Path contains unsupported characters.");
}

function normalizeRemotePath(input: string): string {
  const value = (input ?? "").trim();
  if (!value) throw transferError("TRANSFER_INVALID_REQUEST", "Remote path is required.");
  if (/\u0000|\n|\r/.test(value)) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Remote path contains unsupported characters.");
  }
  if (!SAFE_REMOTE_PATH.test(value)) {
    throw transferError(
      "TRANSFER_INVALID_REQUEST",
      "Path contains unsupported characters for rsync transfer in this version."
    );
  }
  const normalized = posixPath.normalize(value);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function buildRsyncRemoteSpec(username: string, host: string, remotePath: string): string {
  if (!SAFE_HOST_USER.test(username) || !SAFE_HOST_USER.test(host)) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Invalid username or host for rsync transfer.");
  }
  return `${username}@${host}:${remotePath}`;
}

function transferError(code: TransferServiceErrorCode, message: string, detail?: string): TransferServiceError {
  const err = new Error(message) as TransferServiceError;
  err.code = code;
  err.detail = detail;
  return err;
}

async function runSimpleCommand(
  command: string,
  args: string[],
  notFoundMessage: string
): Promise<{ ok: true } | { ok: false; message: string; detail?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      const isMissing = (error as NodeJS.ErrnoException).code === "ENOENT";
      resolve({
        ok: false,
        message: isMissing ? notFoundMessage : `Failed to run ${command} precheck.`,
        detail: error.message
      });
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, message: notFoundMessage, detail: stderr.trim().slice(0, 300) || undefined });
    });
  });
}
