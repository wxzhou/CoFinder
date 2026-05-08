import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { posix as posixPath } from "node:path";
import type { EnqueueDownloadRequest, EnqueueUploadRequest, TransferUpdatePayload } from "../../shared/types/ipc";
import type { TransferTask } from "../../shared/types/models";
import { redactSensitivePlaintext } from "../security/redactSensitive";
import { buildProcessEnv } from "../utils/processEnv";
import { assertSafeRemotePath, isSafeHostOrUsername } from "../utils/pathSafety";

type TransferServiceErrorCode = "TRANSFER_INVALID_REQUEST" | "TRANSFER_PRECHECK_FAILED" | "TRANSFER_NOT_FOUND" | "TRANSFER_NOT_RUNNING";
type TransferServiceError = Error & { code: TransferServiceErrorCode; detail?: string };
type CommandCheckResult = { ok: true } | { ok: false; message: string; detail?: string };
type RunCommand = (command: string, args: string[], notFoundMessage: string) => Promise<CommandCheckResult>;
type SpawnProcess = (command: string, args: string[]) => ChildProcess;

type RunningContext = {
  taskId: string;
  child: ChildProcess;
};

type TransferQueueDeps = {
  now: () => number;
  runCommand: RunCommand;
  spawnProcess: SpawnProcess;
  pathExists: (fullPath: string) => Promise<boolean>;
};

export class TransferQueueService {
  private tasks: TransferTask[] = [];
  private running: RunningContext | null = null;
  private listeners = new Set<(payload: TransferUpdatePayload) => void>();
  private readonly deps: TransferQueueDeps;

  constructor(deps?: Partial<TransferQueueDeps>) {
    this.deps = {
      now: deps?.now ?? (() => Date.now()),
      runCommand: deps?.runCommand ?? runSimpleCommand,
      spawnProcess: deps?.spawnProcess ?? defaultSpawnProcess,
      pathExists: deps?.pathExists ?? defaultPathExists
    };
  }

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
    validateRsyncPath(request.remoteDestinationDir);

    const taskIds: string[] = [];
    for (const source of request.localSources) {
      validateLocalPath(source);
      await ensureExistingPath(this.deps.pathExists, source);
      const sourceName = path.basename(source);
      const remotePath = validateRsyncPath(posixPath.join(request.remoteDestinationDir, sourceName));
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
    await ensureExistingPath(this.deps.pathExists, request.localDestinationDir);

    const taskIds: string[] = [];
    for (const source of request.remoteSources) {
      const remotePath = validateRsyncPath(source);
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
    task.finishedAt = this.deps.now();
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

  async shutdown(): Promise<void> {
    if (!this.running) return;
    const runningTask = this.tasks.find((task) => task.id === this.running?.taskId);
    if (runningTask && runningTask.status === "running") {
      runningTask.status = "stopped";
      runningTask.finishedAt = this.deps.now();
      runningTask.error = "Transfer stopped because application is quitting.";
      this.appendLog(runningTask, "Stopping transfer due to application shutdown.");
    }
    this.running.child.kill("SIGTERM");
    this.running = null;
    this.emit();
  }

  private makeTask(input: Omit<TransferTask, "id" | "status" | "rawLog" | "createdAt">): TransferTask {
    return {
      id: randomUUID(),
      status: "pending",
      rawLog: [],
      createdAt: this.deps.now(),
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
    task.startedAt = this.deps.now();
    task.error = undefined;
    this.emit();

    const rsyncCheck = await this.deps.runCommand("rsync", ["--version"], "rsync is not installed or not found in PATH");
    if (!rsyncCheck.ok) {
      this.failTask(task, rsyncCheck.message, rsyncCheck.detail);
      return;
    }
    const sshCheck = await this.deps.runCommand(
      "ssh",
      ["-o", "BatchMode=yes", "-p", String(task.port), `${task.username}@${task.host}`, "true"],
      "SSH key/passwordless login required for rsync transfer."
    );
    if (!sshCheck.ok) {
      this.failTask(task, sshCheck.message, sshCheck.detail);
      return;
    }

    const args =
      task.direction === "upload"
        ? buildRsyncUploadArgs(task.port, task.username, task.host, task.localPath, task.remotePath)
        : buildRsyncDownloadArgs(task.port, task.username, task.host, task.remotePath, task.localPath);

    // Directory transfer rule: source path does not get trailing slash, so rsync keeps the directory itself.
    const child = this.deps.spawnProcess("rsync", args);
    this.running = { taskId: task.id, child };

    await new Promise<void>((resolve) => {
      child.stdout?.on("data", (chunk: Buffer) => {
        for (const raw of chunk.toString("utf8").split(/\r?\n/)) {
          if (!raw.trim()) continue;
          this.consumeProgressLine(task, raw.trim());
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        for (const raw of chunk.toString("utf8").split(/\r?\n/)) {
          if (!raw.trim()) continue;
          this.consumeProgressLine(task, raw.trim());
        }
      });
      child.on("error", (error) => {
        task.status = "failed";
        task.finishedAt = this.deps.now();
        task.error = (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "rsync is not installed or not found in PATH"
          : "Failed to start rsync process.";
        this.appendLog(task, task.error);
        this.running = null;
        this.emit();
        resolve();
      });
      child.on("close", (code, signal) => {
        task.finishedAt = this.deps.now();
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

  private failTask(task: TransferTask, message: string, detail?: string): void {
    task.status = "failed";
    task.error = message;
    task.finishedAt = this.deps.now();
    this.appendLog(task, message);
    if (detail) this.appendLog(task, redactSensitivePlaintext(detail.slice(0, 300)));
    this.emit();
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

}

async function ensureExistingPath(pathExists: (fullPath: string) => Promise<boolean>, fullPath: string): Promise<void> {
  const exists = await pathExists(fullPath);
  if (!exists) throw transferError("TRANSFER_INVALID_REQUEST", `Path not found: ${fullPath}`);
}

function validateCommonRequest(request: {
  tabId: string;
  host: string;
  port: number;
  username: string;
}): void {
  if (!request.tabId.trim()) throw transferError("TRANSFER_INVALID_REQUEST", "Tab id is required.");
  if (!isSafeHostOrUsername(request.host)) throw transferError("TRANSFER_INVALID_REQUEST", "Invalid host for rsync transfer.");
  if (!isSafeHostOrUsername(request.username)) {
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

export function validateRsyncPath(input: string): string {
  const value = (input ?? "").trim();
  if (!value) throw transferError("TRANSFER_INVALID_REQUEST", "Remote path is required.");
  if (/\u0000|\n|\r/.test(value)) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Remote path contains unsupported characters.");
  }
  try {
    return assertSafeRemotePath(value);
  } catch {
    throw transferError(
      "TRANSFER_INVALID_REQUEST",
      "Path contains unsupported characters for rsync transfer in this version."
    );
  }
}

export function buildRsyncRemoteSpec(username: string, host: string, remotePath: string): string {
  if (!isSafeHostOrUsername(username) || !isSafeHostOrUsername(host)) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Invalid username or host for rsync transfer.");
  }
  return `${username}@${host}:${remotePath}`;
}

export function buildSshSpec(port: number): string {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw transferError("TRANSFER_INVALID_REQUEST", "Port must be between 1 and 65535.");
  }
  return `ssh -p ${port} -o BatchMode=yes`;
}

export function buildRsyncUploadArgs(
  port: number,
  username: string,
  host: string,
  localSourcePath: string,
  remoteDestinationPath: string
): string[] {
  validateLocalPath(localSourcePath);
  const remotePath = validateRsyncPath(remoteDestinationPath);
  return ["-avh", "--progress", "-e", buildSshSpec(port), localSourcePath, buildRsyncRemoteSpec(username, host, remotePath)];
}

export function buildRsyncDownloadArgs(
  port: number,
  username: string,
  host: string,
  remoteSourcePath: string,
  localDestinationDir: string
): string[] {
  validateLocalPath(localDestinationDir);
  const remotePath = validateRsyncPath(remoteSourcePath);
  return ["-avh", "--progress", "-e", buildSshSpec(port), buildRsyncRemoteSpec(username, host, remotePath), localDestinationDir];
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
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: buildProcessEnv() });
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

function defaultSpawnProcess(command: string, args: string[]): ChildProcess {
  return spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: buildProcessEnv() });
}

async function defaultPathExists(fullPath: string): Promise<boolean> {
  try {
    await fs.stat(fullPath);
    return true;
  } catch {
    return false;
  }
}
