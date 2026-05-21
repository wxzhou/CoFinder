import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { posix as posixPath } from "node:path";
import type { EnqueueDeleteRequest, EnqueueDownloadRequest, EnqueueGzipRequest, EnqueueUploadRequest, TransferUpdatePayload } from "../../shared/types/ipc";
import type { TransferErrorCategory, TransferTask, TransferTaskItem } from "../../shared/types/models";
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
  localPathKind: (fullPath: string) => Promise<"file" | "directory" | "other">;
  localDirectoryFiles: (fullPath: string) => Promise<TransferTaskItem[]>;
  localDelete: (paths: string[]) => Promise<number>;
  remoteDelete: (connectionId: string, paths: string[]) => Promise<number>;
  localGzip: (path: string, options: { deleteSourceAfterSuccess: boolean }) => Promise<string>;
  remoteGzip: (connectionId: string, path: string, options: { deleteSourceAfterSuccess: boolean }) => Promise<string>;
};

export class TransferQueueService {
  private tasks: TransferTask[] = [];
  private running: RunningContext | null = null;
  private pumpInFlight = false;
  private listeners = new Set<(payload: TransferUpdatePayload) => void>();
  private readonly deps: TransferQueueDeps;

  constructor(deps?: Partial<TransferQueueDeps>) {
    this.deps = {
      now: deps?.now ?? (() => Date.now()),
      runCommand: deps?.runCommand ?? runSimpleCommand,
      spawnProcess: deps?.spawnProcess ?? defaultSpawnProcess,
      pathExists: deps?.pathExists ?? defaultPathExists,
      localPathKind: deps?.localPathKind ?? defaultLocalPathKind,
      localDirectoryFiles: deps?.localDirectoryFiles ?? defaultLocalDirectoryFiles,
      localDelete: deps?.localDelete ?? defaultUnavailableLocalDelete,
      remoteDelete: deps?.remoteDelete ?? defaultUnavailableRemoteDelete,
      localGzip: deps?.localGzip ?? defaultUnavailableLocalGzip,
      remoteGzip: deps?.remoteGzip ?? defaultUnavailableRemoteGzip
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
      const sourceKind = await this.deps.localPathKind(source);
      const destinationPath = validateRsyncPath(request.remoteTargetOverrides?.[source] ?? posixPath.join(request.remoteDestinationDir, sourceName));
      const rsyncRemotePath =
        sourceKind === "directory" && !request.remoteTargetOverrides?.[source]
          ? validateRsyncPath(request.remoteDestinationDir)
          : destinationPath;
      const task = this.makeTask({
        tabId: request.tabId,
        kind: "upload",
        direction: "upload",
        profileId: request.profileId,
        connectionId: request.connectionId,
        host: request.host,
        port: request.port,
        username: request.username,
        source,
        destination: destinationPath,
        sourceDisplay: source,
        destinationDisplay: `${request.username}@${request.host}:${destinationPath}`,
        localPath: source,
        remotePath: rsyncRemotePath,
        preserveTimestamps: request.preserveTimestamps ?? true
      });
      if (sourceKind === "directory") {
        const items = await this.deps.localDirectoryFiles(source).catch(() => []);
        if (items.length > 0) {
          task.itemEntries = items;
          task.itemTotalCount = items.length;
          task.itemDoneCount = 0;
        }
      }
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
      const localPath = request.localTargetOverrides?.[source] ?? path.join(request.localDestinationDir, sourceName);
      validateLocalPath(localPath);
      const task = this.makeTask({
        tabId: request.tabId,
        kind: "download",
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
        localPath,
        remotePath,
        preserveTimestamps: request.preserveTimestamps ?? true
      });
      this.tasks.push(task);
      taskIds.push(task.id);
    }
    this.emit();
    void this.pump();
    return { queued: true, taskIds };
  }

  async enqueueDelete(request: EnqueueDeleteRequest): Promise<{ queued: true; taskIds: string[] }> {
    validateOperationRequest(request);
    if (request.paths.length === 0) throw transferError("TRANSFER_INVALID_REQUEST", "Select at least one path to delete.");
    if (request.pane === "remote" && !request.connectionId?.trim()) {
      throw transferError("TRANSFER_INVALID_REQUEST", "Remote connection id is required for delete.");
    }
    const paths = unique(request.paths.map((item) => validateOperationPath(item)));
    const lockKey = operationLockKey("delete", request.pane, request.connectionId, paths);
    this.assertNoConflictingOperation(lockKey, "A delete job is already queued or running for this path.");
    const label = paths.length === 1 ? paths[0] : `${paths.length} items`;
    const task = this.makeTask({
      tabId: request.tabId,
      kind: "delete",
      pane: request.pane,
      source: label,
      destination: "",
      sourceDisplay: request.pane === "remote" ? `Remote delete: ${label}` : `Local delete: ${label}`,
      destinationDisplay: "",
      connectionId: request.connectionId,
      host: "",
      port: 0,
      username: "",
      remotePath: request.pane === "remote" ? label : "",
      localPath: request.pane === "local" ? label : "",
      operationPaths: paths,
      operationLockKey: lockKey
    });
    this.tasks.push(task);
    this.emit();
    void this.pump();
    return { queued: true, taskIds: [task.id] };
  }

  async enqueueGzip(request: EnqueueGzipRequest): Promise<{ queued: true; taskIds: string[] }> {
    validateOperationRequest(request);
    const sourcePath = validateOperationPath(request.path);
    if (request.pane === "remote" && !request.connectionId?.trim()) {
      throw transferError("TRANSFER_INVALID_REQUEST", "Remote connection id is required for gzip.");
    }
    const destinationPath = `${sourcePath}.gz`;
    const lockKey = operationLockKey("gzip", request.pane, request.connectionId, [sourcePath]);
    this.assertNoConflictingOperation(lockKey, "A gzip job is already queued or running for this path.");
    const task = this.makeTask({
      tabId: request.tabId,
      kind: "gzip",
      pane: request.pane,
      source: sourcePath,
      destination: destinationPath,
      sourceDisplay: request.pane === "remote" ? `Remote gzip: ${sourcePath}` : `Local gzip: ${sourcePath}`,
      destinationDisplay: destinationPath,
      connectionId: request.connectionId,
      host: "",
      port: 0,
      username: "",
      remotePath: request.pane === "remote" ? sourcePath : "",
      localPath: request.pane === "local" ? sourcePath : "",
      deleteSourceAfterSuccess: !!request.deleteSourceAfterSuccess,
      operationLockKey: lockKey
    });
    this.tasks.push(task);
    this.emit();
    void this.pump();
    return { queued: true, taskIds: [task.id] };
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

  async retry(taskId: string): Promise<{ retried: true }> {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) throw transferError("TRANSFER_NOT_FOUND", "Transfer task not found.");
    if (task.status !== "failed") throw transferError("TRANSFER_INVALID_REQUEST", "Only failed tasks can be retried.");
    task.status = "pending";
    task.startedAt = undefined;
    task.finishedAt = undefined;
    task.error = undefined;
    task.errorCode = undefined;
    task.percent = undefined;
    task.speed = undefined;
    task.eta = undefined;
    task.currentFile = undefined;
    task.progressText = undefined;
    this.resetTaskItems(task);
    task.rawLog = [];
    this.emit();
    void this.pump();
    return { retried: true };
  }

  async retryFailed(): Promise<{ retried: number }> {
    let retried = 0;
    for (const task of this.tasks) {
      if (task.status !== "failed") continue;
      task.status = "pending";
      task.startedAt = undefined;
      task.finishedAt = undefined;
      task.error = undefined;
      task.errorCode = undefined;
      task.percent = undefined;
      task.speed = undefined;
      task.eta = undefined;
      task.currentFile = undefined;
      task.progressText = undefined;
      this.resetTaskItems(task);
      task.rawLog = [];
      retried += 1;
    }
    if (retried > 0) {
      this.emit();
      void this.pump();
    }
    return { retried };
  }

  clearCompleted(): { cleared: number } {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.status === "running" || task.status === "pending" || task.status === "checking" || task.status === "conflict");
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
    if (this.running || this.pumpInFlight) return;
    const next = this.tasks.find((task) => task.status === "pending");
    if (!next) return;
    this.pumpInFlight = true;
    try {
      await this.runTask(next);
    } finally {
      this.pumpInFlight = false;
    }
    void this.pump();
  }

  private async runTask(task: TransferTask): Promise<void> {
    task.status = "running";
    task.startedAt = this.deps.now();
    task.error = undefined;
    this.emit();

    if (task.kind === "delete" || task.kind === "gzip") {
      await this.runOperationTask(task);
      return;
    }

    const rsyncCheck = await this.deps.runCommand("rsync", ["--version"], "rsync is not installed or not found in PATH");
    if (!rsyncCheck.ok) {
      this.failTask(task, rsyncCheck.message, rsyncCheck.detail);
      return;
    }
    const args =
      task.direction === "upload"
        ? buildRsyncUploadArgs(task.port, task.username, task.host, task.localPath, task.remotePath, task.preserveTimestamps)
        : buildRsyncDownloadArgs(task.port, task.username, task.host, task.remotePath, task.localPath, task.preserveTimestamps);

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
        task.errorCode = classifyTransferFailure(task.error);
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
          task.errorCode = "unknown";
          this.appendLog(task, task.error);
        } else if (code === 0) {
          task.status = "success";
          task.errorCode = undefined;
          this.completeTaskItems(task);
          this.appendLog(task, "Transfer completed successfully.");
        } else {
          task.status = "failed";
          this.failRunningTaskItem(task);
          const recent = task.rawLog.slice(-20).join("\n");
          task.errorCode = classifyTransferFailure(recent);
          task.error = humanTransferError(task.errorCode, code ?? -1);
          this.appendLog(task, task.error);
        }
        this.running = null;
        this.emit();
        resolve();
      });
    });
  }

  private async runOperationTask(task: TransferTask): Promise<void> {
    try {
      if (task.kind === "delete") {
        const paths = task.operationPaths?.length ? task.operationPaths : [task.source];
        task.currentFile = paths.length === 1 ? paths[0] : `${paths.length} items`;
        task.progressText = "Deleting...";
        this.emit();
        const deleted = task.pane === "remote"
          ? await this.deps.remoteDelete(requiredConnectionId(task), paths)
          : await this.deps.localDelete(paths);
        task.status = "success";
        task.finishedAt = this.deps.now();
        task.progressText = `Deleted ${deleted} ${deleted === 1 ? "item" : "items"}.`;
        this.appendLog(task, task.progressText);
        this.emit();
        return;
      }

      task.currentFile = task.source;
      task.progressText = "Compressing...";
      this.emit();
      const output = task.pane === "remote"
        ? await this.deps.remoteGzip(requiredConnectionId(task), task.source, { deleteSourceAfterSuccess: !!task.deleteSourceAfterSuccess })
        : await this.deps.localGzip(task.source, { deleteSourceAfterSuccess: !!task.deleteSourceAfterSuccess });
      task.status = "success";
      task.destination = output;
      task.destinationDisplay = output;
      task.finishedAt = this.deps.now();
      task.progressText = task.deleteSourceAfterSuccess ? "Compressed and deleted source." : "Compressed; source kept.";
      this.appendLog(task, `Gzip completed: ${output}`);
      this.emit();
    } catch (error) {
      task.status = "failed";
      task.finishedAt = this.deps.now();
      task.error = error instanceof Error ? error.message : "Job failed.";
      task.errorCode = classifyTransferFailure(task.error);
      this.appendLog(task, redactSensitivePlaintext(task.error));
      this.emit();
    }
  }

  private consumeProgressLine(task: TransferTask, line: string): void {
    const safeLine = line.slice(0, 400);
    this.appendLog(task, safeLine);
    const fileHint = safeLine.match(/to-ch(?:eck|k)=\d+\/\d+\)\s*(.+)$/);
    if (fileHint && fileHint[1]) task.currentFile = fileHint[1];
    const itemPath = parseRsyncItemPath(safeLine);
    if (itemPath) this.markCurrentTaskItem(task, itemPath);

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

  private resetTaskItems(task: TransferTask): void {
    if (!task.itemEntries) return;
    task.itemEntries = task.itemEntries.map((item) => ({ ...item, status: "pending" }));
    task.itemDoneCount = 0;
  }

  private completeTaskItems(task: TransferTask): void {
    if (!task.itemEntries) return;
    task.itemEntries = task.itemEntries.map((item) => ({ ...item, status: "success" }));
    task.itemDoneCount = task.itemEntries.length;
  }

  private failRunningTaskItem(task: TransferTask): void {
    if (!task.itemEntries) return;
    task.itemEntries = task.itemEntries.map((item) => (item.status === "running" ? { ...item, status: "failed" } : item));
    task.itemDoneCount = task.itemEntries.filter((item) => item.status === "success").length;
  }

  private markCurrentTaskItem(task: TransferTask, itemPath: string): void {
    if (!task.itemEntries) return;
    const normalized = normalizeTransferItemPath(itemPath);
    const sourceBase = normalizeTransferItemPath(path.basename(task.localPath));
    const index = task.itemEntries.findIndex((item) => {
      const withBase = sourceBase ? `${sourceBase}/${item.relativePath}` : item.relativePath;
      return item.relativePath === normalized || item.displayPath === normalized || withBase === normalized;
    });
    if (index < 0) return;
    task.itemEntries = task.itemEntries.map((item, i) => {
      if (i === index) return { ...item, status: "running" };
      if (item.status === "running") return { ...item, status: "success" };
      return item;
    });
    task.itemDoneCount = task.itemEntries.filter((item) => item.status === "success").length;
    task.currentFile = task.itemEntries[index].displayPath;
    this.emit();
  }

  private failTask(task: TransferTask, message: string, detail?: string): void {
    task.status = "failed";
    task.error = message;
    task.errorCode = classifyTransferFailure(`${message}\n${detail ?? ""}`);
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
      itemEntries: task.itemEntries?.map((item) => ({ ...item })),
      rawLog: [...task.rawLog]
    }));
  }

  private assertNoConflictingOperation(lockKey: string, message: string): void {
    const conflict = this.tasks.find((task) =>
      task.operationLockKey === lockKey && (task.status === "pending" || task.status === "running")
    );
    if (conflict) throw transferError("TRANSFER_INVALID_REQUEST", message);
  }

}

function classifyTransferFailure(text: string): TransferErrorCategory {
  if (/rsync is not installed|not found in PATH|ENOENT/i.test(text)) return "rsync_not_found";
  if (/BatchMode|Permission denied \(publickey\)|SSH key\/passwordless/i.test(text)) return "ssh_batchmode_failed";
  if (/No space left/i.test(text)) return "no_space_left";
  if (/Permission denied|EACCES|EPERM/i.test(text)) return "permission_denied";
  if (/No such file|not found|ENOENT|No such path/i.test(text)) return "path_not_found";
  if (/Connection reset|Connection lost|disconnect|Broken pipe|timed out/i.test(text)) return "remote_disconnected";
  return "unknown";
}

function humanTransferError(category: TransferErrorCategory, exitCode: number): string {
  if (category === "permission_denied") return "Transfer failed: permission denied.";
  if (category === "path_not_found") return "Transfer failed: path not found.";
  if (category === "no_space_left") return "Transfer failed: no space left on destination.";
  if (category === "remote_disconnected") return "Transfer failed: remote connection was interrupted.";
  if (category === "rsync_not_found") return "rsync is not installed or not found in PATH";
  if (category === "ssh_batchmode_failed") return "SSH key/passwordless login required for rsync transfer.";
  return `rsync exited with code ${exitCode}.`;
}

function parseRsyncItemPath(line: string): string | null {
  if (!line || line.endsWith("/") || line.startsWith("sending ") || line.startsWith("receiving ") || line.startsWith("sent ")) return null;
  if (/^\s*\d[\d,.]*\s+\d+%/.test(line)) return null;
  if (/^(total size is|created directory|deleting |\.\/?$)/i.test(line)) return null;
  if (/\s+\d+%\s+/.test(line) || /xfr#\d+/.test(line) || /to-ch(?:eck|k)=/.test(line)) return null;
  return normalizeTransferItemPath(line);
}

function normalizeTransferItemPath(input: string): string {
  return input.replace(/^\.\//, "").replace(/\\/g, "/").replace(/^\/+/, "");
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

function validateOperationRequest(request: {
  tabId: string;
  pane: "local" | "remote";
}): void {
  if (!request.tabId.trim()) throw transferError("TRANSFER_INVALID_REQUEST", "Tab id is required.");
  if (request.pane !== "local" && request.pane !== "remote") {
    throw transferError("TRANSFER_INVALID_REQUEST", "Pane must be local or remote.");
  }
}

function validateOperationPath(input: string): string {
  const value = (input ?? "").trim();
  if (!value) throw transferError("TRANSFER_INVALID_REQUEST", "Path is required.");
  if (/\u0000|\n|\r/.test(value)) throw transferError("TRANSFER_INVALID_REQUEST", "Path contains unsupported characters.");
  return value;
}

function operationLockKey(kind: "delete" | "gzip", pane: "local" | "remote", connectionId: string | undefined, paths: string[]): string {
  return `${kind}\u0000${pane}\u0000${connectionId ?? ""}\u0000${paths.slice().sort().join("\u0000")}`;
}

function requiredConnectionId(task: TransferTask): string {
  if (!task.connectionId) throw transferError("TRANSFER_INVALID_REQUEST", "Remote connection id is required.");
  return task.connectionId;
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
  remoteDestinationPath: string,
  preserveTimestamps = true
): string[] {
  validateLocalPath(localSourcePath);
  const remotePath = validateRsyncPath(remoteDestinationPath);
  return [preserveTimestamps ? "-avh" : "-rvh", "--progress", "-e", buildSshSpec(port), localSourcePath, buildRsyncRemoteSpec(username, host, remotePath)];
}

export function buildRsyncDownloadArgs(
  port: number,
  username: string,
  host: string,
  remoteSourcePath: string,
  localDestinationDir: string,
  preserveTimestamps = true
): string[] {
  validateLocalPath(localDestinationDir);
  const remotePath = validateRsyncPath(remoteSourcePath);
  return [preserveTimestamps ? "-avh" : "-rvh", "--progress", "-e", buildSshSpec(port), buildRsyncRemoteSpec(username, host, remotePath), localDestinationDir];
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

async function defaultLocalPathKind(fullPath: string): Promise<"file" | "directory" | "other"> {
  const stat = await fs.stat(fullPath);
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "other";
}

async function defaultLocalDirectoryFiles(rootPath: string): Promise<TransferTaskItem[]> {
  const out: TransferTaskItem[] = [];
  await walkLocalDirectory(rootPath, "", out);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

async function defaultUnavailableLocalDelete(): Promise<number> {
  throw transferError("TRANSFER_INVALID_REQUEST", "Local delete job support is unavailable.");
}

async function defaultUnavailableRemoteDelete(): Promise<number> {
  throw transferError("TRANSFER_INVALID_REQUEST", "Remote delete job support is unavailable.");
}

async function defaultUnavailableLocalGzip(): Promise<string> {
  throw transferError("TRANSFER_INVALID_REQUEST", "Local gzip job support is unavailable.");
}

async function defaultUnavailableRemoteGzip(): Promise<string> {
  throw transferError("TRANSFER_INVALID_REQUEST", "Remote gzip job support is unavailable.");
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

async function walkLocalDirectory(rootPath: string, relativeDir: string, out: TransferTaskItem[]): Promise<void> {
  const currentDir = relativeDir ? path.join(rootPath, relativeDir) : rootPath;
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeDir ? path.posix.join(relativeDir.replace(/\\/g, "/"), entry.name) : entry.name;
    const fullPath = path.join(rootPath, relativePath);
    if (entry.isDirectory()) {
      await walkLocalDirectory(rootPath, relativePath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs.stat(fullPath).catch(() => null);
    out.push({
      relativePath: normalizeTransferItemPath(relativePath),
      displayPath: normalizeTransferItemPath(relativePath),
      size: stat?.size,
      status: "pending"
    });
  }
}
