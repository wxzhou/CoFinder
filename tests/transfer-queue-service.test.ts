import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { TransferQueueService } from "../src/main/services/TransferQueueService";
import type { EnqueueDownloadRequest, EnqueueUploadRequest, RemoteCopyMoveConflictPolicy } from "../src/shared/types/ipc";
import type { TransferTaskItem } from "../src/shared/types/models";

class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killedSignals: string[] = [];

  kill(signal: string = "SIGTERM") {
    this.killedSignals.push(signal);
    this.emit("close", null, signal);
    return true;
  }
}

const baseUpload: EnqueueUploadRequest = {
  tabId: "tab-a",
  host: "example.com",
  port: 22,
  username: "alice",
  localSources: ["/tmp/source.txt"],
  remoteDestinationDir: "/remote",
  authType: "password"
};

const baseDownload: EnqueueDownloadRequest = {
  tabId: "tab-a",
  host: "example.com",
  port: 22,
  username: "alice",
  remoteSources: ["/remote/source.txt"],
  localDestinationDir: "/tmp",
  authType: "password"
};

function createService(options?: {
  runCommand?: (command: string) => Promise<{ ok: true } | { ok: false; message: string; detail?: string }>;
  procs?: FakeProc[];
  pathExists?: boolean;
  localPathKind?: "file" | "directory" | "other";
  localDirectoryFiles?: TransferTaskItem[];
  localDelete?: (paths: string[]) => Promise<number>;
  remoteDelete?: (connectionId: string, paths: string[]) => Promise<number>;
  localGzip?: (path: string, options: { deleteSourceAfterSuccess: boolean }) => Promise<string>;
  remoteGzip?: (connectionId: string, path: string, options: { deleteSourceAfterSuccess: boolean }) => Promise<string>;
  localDecompress?: (path: string) => Promise<string>;
  remoteDecompress?: (connectionId: string, path: string) => Promise<string>;
  localMd5?: (path: string) => Promise<string>;
  remoteMd5?: (connectionId: string, path: string) => Promise<string>;
  remoteCopy?: (connectionId: string, sourcePath: string, destinationPath: string, options: { conflictPolicy: RemoteCopyMoveConflictPolicy; forceDestinationDirectory: boolean }) => Promise<string>;
  remoteMove?: (connectionId: string, sourcePath: string, destinationPath: string, options: { conflictPolicy: RemoteCopyMoveConflictPolicy; forceDestinationDirectory: boolean }) => Promise<string>;
  remoteUploadFallback?: (connectionId: string, localPath: string, remotePath: string) => Promise<void>;
  remoteDownloadFallback?: (connectionId: string, remotePath: string, localPath: string) => Promise<void>;
  compressionConcurrency?: number;
}) {
  const procs = options?.procs ?? [new FakeProc()];
  const spawnProcess = vi.fn(() => procs.shift() as unknown as ChildProcess);
  const runCommand = vi.fn(async (command: string) => {
    if (options?.runCommand) return options.runCommand(command);
    return { ok: true } as const;
  });

  const service = new TransferQueueService({
    spawnProcess,
    runCommand: async (command, _args, notFoundMessage) => {
      const result = await runCommand(command);
      if (result.ok) return result;
      return { ok: false as const, message: result.message || notFoundMessage, detail: result.detail };
    },
    pathExists: async () => options?.pathExists ?? true,
    localPathKind: async () => options?.localPathKind ?? "file",
    localDirectoryFiles: async () => options?.localDirectoryFiles ?? [],
    localDelete: options?.localDelete,
    remoteDelete: options?.remoteDelete,
    localGzip: options?.localGzip,
    remoteGzip: options?.remoteGzip,
    localDecompress: options?.localDecompress,
    remoteDecompress: options?.remoteDecompress,
    localMd5: options?.localMd5,
    remoteMd5: options?.remoteMd5,
    remoteCopy: options?.remoteCopy,
    remoteMove: options?.remoteMove,
    remoteUploadFallback: options?.remoteUploadFallback,
    remoteDownloadFallback: options?.remoteDownloadFallback,
    compressionConcurrency: options?.compressionConcurrency
  });

  return { service, spawnProcess, runCommand };
}

describe("TransferQueueService state machine", () => {
  it("enqueues task and auto starts first pending", async () => {
    const { service } = createService();
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      const tasks = service.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe("running");
    });
  });

  it("runs one task at a time and starts second after first succeeds", async () => {
    const p1 = new FakeProc();
    const p2 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1, p2] });

    await service.enqueueUpload({ ...baseUpload, localSources: ["/tmp/a.txt", "/tmp/b.txt"] });
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(service.list().map((t) => t.status)).toEqual(["running", "pending"]);
    });

    p1.emit("close", 0, null);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(2);
      expect(service.list().map((t) => t.status)).toEqual(["success", "running"]);
    });
  });

  it("enqueues one task per source and keeps tab/source metadata", async () => {
    const p1 = new FakeProc();
    const p2 = new FakeProc();
    const { service } = createService({ procs: [p1, p2] });
    await service.enqueueUpload({ ...baseUpload, tabId: "tab-meta", localSources: ["/tmp/a.txt", "/tmp/b.txt"] });

    const tasks = service.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].tabId).toBe("tab-meta");
    expect(tasks[0].source).toBe("/tmp/a.txt");
    expect(tasks[1].source).toBe("/tmp/b.txt");
    expect(tasks[0].destination).toContain("/remote/");
  });

  it("uses conflict target overrides when enqueueing upload and download tasks", async () => {
    const { service } = createService({ procs: [new FakeProc(), new FakeProc()] });

    await service.enqueueUpload({
      ...baseUpload,
      localSources: ["/tmp/source.txt"],
      remoteTargetOverrides: { "/tmp/source.txt": "/remote/source copy.txt" }
    });
    await service.enqueueDownload({
      ...baseDownload,
      remoteSources: ["/remote/source.txt"],
      localTargetOverrides: { "/remote/source.txt": "/tmp/source copy.txt" }
    });

    const tasks = service.list();
    expect(tasks[0].destination).toBe("/remote/source copy.txt");
    expect(tasks[0].remotePath).toBe("/remote/source copy.txt");
    expect(tasks[1].destination).toBe("/tmp/source copy.txt");
    expect(tasks[1].localPath).toBe("/tmp/source copy.txt");
  });

  it("cancels pending task", async () => {
    const p1 = new FakeProc();
    const { service } = createService({ procs: [p1] });
    await service.enqueueUpload({ ...baseUpload, localSources: ["/tmp/a.txt", "/tmp/b.txt"] });

    const pending = service.list().find((t) => t.status === "pending");
    expect(pending).toBeTruthy();
    await service.cancel(pending!.id);
    expect(service.list().find((t) => t.id === pending!.id)?.status).toBe("canceled");
  });

  it("stops running task and sends SIGTERM", async () => {
    const p1 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1] });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(service.list().find((t) => t.status === "running")).toBeTruthy();
    });
    const running = service.list().find((t) => t.status === "running");

    await service.stop(running!.id);
    expect(p1.killedSignals).toContain("SIGTERM");
    expect(service.list().find((t) => t.id === running!.id)?.status).toBe("stopped");
  });

  it("marks task failed on non-zero rsync exit", async () => {
    const p1 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1] });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(service.list()[0].status).toBe("running");
    });

    p1.emit("close", 23, null);
    await vi.waitFor(() => {
      expect(service.list()[0].status).toBe("failed");
      expect(service.list()[0].error).toMatch(/rsync exited/i);
    });
  });

  it("classifies common rsync failures with stable error codes", async () => {
    const p1 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1] });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(service.list()[0].status).toBe("running");
    });

    p1.stderr.emit("data", Buffer.from("rsync: [sender] change_dir failed: Permission denied (13)\n"));
    p1.emit("close", 23, null);

    await vi.waitFor(() => {
      expect(service.list()[0].status).toBe("failed");
      expect(service.list()[0].errorCode).toBe("permission_denied");
      expect(service.list()[0].error).toMatch(/permission denied/i);
    });
  });

  it("does not run a separate ssh preflight before spawning rsync", async () => {
    const p1 = new FakeProc();
    const { service, runCommand, spawnProcess } = createService({ procs: [p1] });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    });
    expect(runCommand).toHaveBeenCalledWith("rsync");
    expect(runCommand).not.toHaveBeenCalledWith("ssh");
  });

  it("uploads directories to the selected parent instead of nesting basename twice", async () => {
    const { service } = createService({ localPathKind: "directory" });
    await service.enqueueUpload({ ...baseUpload, localSources: ["/tmp/xyz"], remoteDestinationDir: "/path1/path2" });

    const task = service.list()[0];
    expect(task.destination).toBe("/path1/path2/xyz");
    expect(task.remotePath).toBe("/path1/path2");
  });

  it("tracks upload directory child files from rsync output", async () => {
    const p1 = new FakeProc();
    const { service, spawnProcess } = createService({
      procs: [p1],
      localPathKind: "directory",
      localDirectoryFiles: [
        { relativePath: "a.bin", displayPath: "a.bin", status: "pending" },
        { relativePath: "nested/b.bin", displayPath: "nested/b.bin", status: "pending" }
      ]
    });

    await service.enqueueUpload({ ...baseUpload, localSources: ["/tmp/folder"] });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.stdout.emit("data", Buffer.from("a.bin\n"));
    await vi.waitFor(() => expect(service.list()[0].currentFile).toBe("a.bin"));
    p1.stdout.emit("data", Buffer.from("folder/nested/b.bin\n"));
    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.itemDoneCount).toBe(1);
      expect(task.itemEntries?.map((item) => item.status)).toEqual(["success", "running"]);
    });
    p1.emit("close", 0, null);
    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.status).toBe("success");
      expect(task.itemDoneCount).toBe(2);
      expect(task.itemEntries?.every((item) => item.status === "success")).toBe(true);
    });
  });

  it("fails task when rsync is missing", async () => {
    const { service } = createService({
      runCommand: async (command) => {
        if (command === "rsync") return { ok: false, message: "rsync is not installed or not found in PATH" };
        return { ok: true };
      }
    });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(service.list()[0].status).toBe("failed");
      expect(service.list()[0].error).toContain("rsync is not installed or not found in PATH");
      expect(service.list()[0].errorCode).toBe("rsync_not_found");
    });
  });

  it("retries a failed task preserving transfer metadata", async () => {
    const p1 = new FakeProc();
    const p2 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1, p2] });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));

    p1.emit("close", 23, null);
    await vi.waitFor(() => expect(service.list()[0].status).toBe("failed"));
    const failedTask = service.list()[0];

    await service.retry(failedTask.id);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(2);
      const retried = service.list()[0];
      expect(retried.status).toBe("running");
      expect(retried.source).toBe(failedTask.source);
      expect(retried.destination).toBe(failedTask.destination);
      expect(retried.error).toBeUndefined();
      expect(retried.errorCode).toBeUndefined();
    });
  });

  it("retries all failed tasks", async () => {
    const p1 = new FakeProc();
    const p2 = new FakeProc();
    const p3 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1, p2, p3] });
    await service.enqueueUpload({ ...baseUpload, localSources: ["/tmp/a.txt", "/tmp/b.txt"] });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.emit("close", 23, null);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(2));
    p2.emit("close", 23, null);
    await vi.waitFor(() => expect(service.list().every((task) => task.status === "failed")).toBe(true));

    const res = await service.retryFailed();

    expect(res.retried).toBe(2);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(3);
      const statuses = service.list().map((task) => task.status);
      expect(statuses).toEqual(["running", "pending"]);
    });
  });

  it("collects stdout/stderr logs and emits updates", async () => {
    const p1 = new FakeProc();
    const { service, spawnProcess } = createService({ procs: [p1] });

    const snapshots: string[] = [];
    service.onUpdate((payload) => snapshots.push(payload.tasks.map((t) => t.status).join(",")));

    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(service.list()[0].status).toBe("running");
    });
    p1.stdout.emit("data", Buffer.from("50% 10.0MB/s 00:00:01\n"));
    p1.stderr.emit("data", Buffer.from("xfr#1, to-check=0/1\n"));
    p1.emit("close", 0, null);

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.status).toBe("success");
      expect(task.rawLog.length).toBeGreaterThan(0);
      expect(task.rawLog.join("\n")).not.toContain("password");
      expect(snapshots.length).toBeGreaterThan(1);
    });
  });

  it("runs local delete as a visible queued job without spawning rsync", async () => {
    const localDelete = vi.fn(async () => 2);
    const { service, spawnProcess } = createService({ localDelete });

    await service.enqueueDelete({ tabId: "tab-a", pane: "local", paths: ["/tmp/a.txt", "/tmp/b.txt"] });

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("delete");
      expect(task.status).toBe("success");
      expect(task.progressText).toBe("Deleted 2 items.");
    });
    expect(localDelete).toHaveBeenCalledWith(["/tmp/a.txt", "/tmp/b.txt"]);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("runs remote gzip as a job and forwards delete-source preference", async () => {
    const remoteGzip = vi.fn(async () => "/remote/sample.txt.gz");
    const { service, spawnProcess } = createService({ remoteGzip });

    await service.enqueueGzip({
      tabId: "tab-a",
      pane: "remote",
      connectionId: "c1",
      path: "/remote/sample.txt",
      deleteSourceAfterSuccess: true
    });

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("gzip");
      expect(task.status).toBe("success");
      expect(task.destination).toBe("/remote/sample.txt.gz");
      expect(task.progressText).toBe("Compressed and deleted source.");
    });
    expect(remoteGzip).toHaveBeenCalledWith("c1", "/remote/sample.txt", { deleteSourceAfterSuccess: true });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("keeps failed gzip jobs visible and does not retry destructive work automatically", async () => {
    const localGzip = vi.fn(async () => {
      throw new Error("Gzip target already exists.");
    });
    const { service } = createService({ localGzip });

    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/source.txt" });

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("gzip");
      expect(task.status).toBe("failed");
      expect(task.error).toBe("Gzip target already exists.");
    });
    expect(localGzip).toHaveBeenCalledTimes(1);
  });

  it("runs local decompress as a visible queued job", async () => {
    const localDecompress = vi.fn(async () => "/tmp/source.txt");
    const { service, spawnProcess } = createService({ localDecompress });

    await service.enqueueDecompress({ tabId: "tab-a", pane: "local", path: "/tmp/source.txt.gz" });

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("decompress");
      expect(task.status).toBe("success");
      expect(task.destination).toBe("/tmp/source.txt");
      expect(task.progressText).toBe("Decompressed.");
    });
    expect(localDecompress).toHaveBeenCalledWith("/tmp/source.txt.gz");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("runs local md5 generation as a visible queued job", async () => {
    const localMd5 = vi.fn(async () => "/tmp/source.txt.md5");
    const { service, spawnProcess } = createService({ localMd5 });

    await service.enqueueMd5({ tabId: "tab-a", pane: "local", path: "/tmp/source.txt" });

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("md5");
      expect(task.status).toBe("success");
      expect(task.destination).toBe("/tmp/source.txt.md5");
      expect(task.progressText).toBe("MD5 generated.");
    });
    expect(localMd5).toHaveBeenCalledWith("/tmp/source.txt");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("runs remote copy as a visible remote mutation job without spawning rsync", async () => {
    const remoteCopy = vi.fn(async () => "/remote/dst/source.txt");
    const { service, spawnProcess } = createService({ remoteCopy });

    await service.enqueueRemoteCopy({
      tabId: "tab-a",
      connectionId: "c1",
      sources: ["/remote/src/source.txt"],
      destinationPath: "/remote/dst/",
      conflictPolicy: "rename"
    });

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("remoteCopy");
      expect(task.status).toBe("success");
      expect(task.destination).toBe("/remote/dst/source.txt");
      expect(task.progressText).toBe("Remote copy completed.");
    });
    expect(remoteCopy).toHaveBeenCalledWith("c1", "/remote/src/source.txt", "/remote/dst/", {
      conflictPolicy: "rename",
      forceDestinationDirectory: true
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("keeps remote move pending while a parent delete lock is running", async () => {
    let finishDelete!: (value: number) => void;
    const remoteDelete = vi.fn(() => new Promise<number>((resolve) => { finishDelete = resolve; }));
    const remoteMove = vi.fn(async () => "/remote/archive/child");
    const { service } = createService({ remoteDelete, remoteMove });

    await service.enqueueDelete({ tabId: "tab-a", pane: "remote", connectionId: "c1", paths: ["/remote/folder"] });
    await service.enqueueRemoteMove({
      tabId: "tab-a",
      connectionId: "c1",
      sources: ["/remote/folder/child"],
      destinationPath: "/remote/archive/"
    });

    await vi.waitFor(() => {
      expect(remoteDelete).toHaveBeenCalledTimes(1);
      expect(remoteMove).not.toHaveBeenCalled();
      expect(service.list().map((task) => task.status)).toEqual(["running", "pending"]);
    });

    finishDelete(1);
    await vi.waitFor(() => expect(remoteMove).toHaveBeenCalledTimes(1));
  });

  it("runs compression lane jobs in parallel up to the configured concurrency", async () => {
    let finishA!: (value: string) => void;
    let finishB!: (value: string) => void;
    const localGzip = vi
      .fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => { finishA = resolve; }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => { finishB = resolve; }));
    const { service } = createService({ localGzip, compressionConcurrency: 2 });

    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/a.txt" });
    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/b.txt" });

    await vi.waitFor(() => {
      expect(localGzip).toHaveBeenCalledTimes(2);
      expect(service.list().map((task) => task.status)).toEqual(["running", "running"]);
    });

    finishA("/tmp/a.txt.gz");
    finishB("/tmp/b.txt.gz");
    await vi.waitFor(() => expect(service.list().every((task) => task.status === "success")).toBe(true));
  });

  it("keeps transfer jobs serial while compression runs beside a transfer", async () => {
    const p1 = new FakeProc();
    const p2 = new FakeProc();
    let finishGzip!: (value: string) => void;
    const localGzip = vi.fn(() => new Promise<string>((resolve) => { finishGzip = resolve; }));
    const { service, spawnProcess } = createService({ procs: [p1, p2], localGzip, compressionConcurrency: 2 });

    await service.enqueueUpload({ ...baseUpload, localSources: ["/tmp/a.txt", "/tmp/b.txt"] });
    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/c.txt" });

    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(localGzip).toHaveBeenCalledTimes(1);
      expect(service.list().map((task) => task.status)).toEqual(["running", "pending", "running"]);
    });

    finishGzip("/tmp/c.txt.gz");
    p1.emit("close", 0, null);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(2));
  });

  it("holds child path jobs pending while a parent delete lock is running", async () => {
    let finishDelete!: (value: number) => void;
    const localDelete = vi.fn(() => new Promise<number>((resolve) => { finishDelete = resolve; }));
    const localGzip = vi.fn(async () => "/tmp/folder/child.txt.gz");
    const { service } = createService({ localDelete, localGzip, compressionConcurrency: 2 });

    await service.enqueueDelete({ tabId: "tab-a", pane: "local", paths: ["/tmp/folder"] });
    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/folder/child.txt" });

    await vi.waitFor(() => {
      expect(localDelete).toHaveBeenCalledTimes(1);
      expect(localGzip).not.toHaveBeenCalled();
      expect(service.list().map((task) => task.status)).toEqual(["running", "pending"]);
    });

    finishDelete(1);
    await vi.waitFor(() => expect(localGzip).toHaveBeenCalledTimes(1));
  });

  it("retries failed compression jobs while honoring lane concurrency", async () => {
    const retryResolvers: Array<(value: string) => void> = [];
    const localGzip = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockImplementation(() => new Promise<string>((resolve) => retryResolvers.push(resolve)));
    const { service } = createService({ localGzip, compressionConcurrency: 2 });

    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/a.txt" });
    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/b.txt" });
    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/c.txt" });
    await vi.waitFor(() => expect(service.list().every((task) => task.status === "failed")).toBe(true));

    const res = await service.retryFailed();

    expect(res.retried).toBe(3);
    await vi.waitFor(() => {
      expect(localGzip).toHaveBeenCalledTimes(5);
      expect(service.list().map((task) => task.status)).toEqual(["running", "running", "pending"]);
    });

    retryResolvers[0]("/tmp/a.txt.gz");
    await vi.waitFor(() => {
      expect(localGzip).toHaveBeenCalledTimes(6);
      expect(service.list().filter((task) => task.status === "running")).toHaveLength(2);
    });
  });

  it("shutdown stops running jobs across lanes", async () => {
    const p1 = new FakeProc();
    let finishGzip!: (value: string) => void;
    const localGzip = vi.fn(() => new Promise<string>((resolve) => { finishGzip = resolve; }));
    const { service, spawnProcess } = createService({ procs: [p1], localGzip, compressionConcurrency: 2 });

    await service.enqueueUpload(baseUpload);
    await service.enqueueGzip({ tabId: "tab-a", pane: "local", path: "/tmp/c.txt" });
    await vi.waitFor(() => {
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect(localGzip).toHaveBeenCalledTimes(1);
      expect(service.list().map((task) => task.status)).toEqual(["running", "running"]);
    });

    await service.shutdown();

    expect(p1.killedSignals).toContain("SIGTERM");
    expect(service.list().map((task) => task.status)).toEqual(["stopped", "stopped"]);
    finishGzip("/tmp/c.txt.gz");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.list().map((task) => task.status)).toEqual(["stopped", "stopped"]);
  });

  it("falls back to SFTP download when rsync exits with SSH code 255", async () => {
    const p1 = new FakeProc();
    const remoteDownloadFallback = vi.fn(async () => undefined);
    const { service, spawnProcess } = createService({ procs: [p1], remoteDownloadFallback });

    await service.enqueueDownload({ ...baseDownload, connectionId: "c1" });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.stderr.emit("data", Buffer.from("Permission denied (publickey).\n"));
    p1.emit("close", 255, null);

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("download");
      expect(task.status).toBe("success");
      expect(task.progressText).toBe("Downloaded over SFTP.");
    });
    expect(remoteDownloadFallback).toHaveBeenCalledWith("c1", "/remote/source.txt", "/tmp/source.txt");
  });

  it("falls back to SFTP upload when rsync exits with SSH code 255", async () => {
    const p1 = new FakeProc();
    const remoteUploadFallback = vi.fn(async () => undefined);
    const { service, spawnProcess } = createService({ procs: [p1], remoteUploadFallback });

    await service.enqueueUpload({ ...baseUpload, connectionId: "c1" });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.stderr.emit("data", Buffer.from("Permission denied, please try again.\n"));
    p1.emit("close", 255, null);

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("upload");
      expect(task.status).toBe("success");
      expect(task.progressText).toBe("Uploaded over SFTP.");
    });
    expect(remoteUploadFallback).toHaveBeenCalledWith("c1", "/tmp/source.txt", "/remote/source.txt");
  });

  it("uses the final destination path for SFTP directory upload fallback", async () => {
    const p1 = new FakeProc();
    const remoteUploadFallback = vi.fn(async () => undefined);
    const { service, spawnProcess } = createService({ procs: [p1], localPathKind: "directory", remoteUploadFallback });

    await service.enqueueUpload({ ...baseUpload, connectionId: "c1", localSources: ["/tmp/xyz"], remoteDestinationDir: "/path1/path2" });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.stderr.emit("data", Buffer.from("Permission denied, please try again.\n"));
    p1.emit("close", 255, null);

    await vi.waitFor(() => expect(service.list()[0].status).toBe("success"));
    expect(remoteUploadFallback).toHaveBeenCalledWith("c1", "/tmp/xyz", "/path1/path2/xyz");
  });

  it("falls back to SFTP download when rsync BatchMode reports generic permission denied", async () => {
    const p1 = new FakeProc();
    const remoteDownloadFallback = vi.fn(async () => undefined);
    const { service, spawnProcess } = createService({ procs: [p1], remoteDownloadFallback });

    await service.enqueueDownload({ ...baseDownload, connectionId: "c1" });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.stderr.emit("data", Buffer.from("Permission denied, please try again.\n"));
    p1.emit("close", 255, null);

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("download");
      expect(task.status).toBe("success");
      expect(task.progressText).toBe("Downloaded over SFTP.");
    });
    expect(remoteDownloadFallback).toHaveBeenCalledWith("c1", "/remote/source.txt", "/tmp/source.txt");
  });

  it("keeps real rsync file permission failures as failures", async () => {
    const p1 = new FakeProc();
    const remoteDownloadFallback = vi.fn(async () => undefined);
    const { service, spawnProcess } = createService({ procs: [p1], remoteDownloadFallback });

    await service.enqueueDownload({ ...baseDownload, connectionId: "c1" });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));
    p1.stderr.emit("data", Buffer.from("rsync: [sender] open \"/remote/source.txt\" failed: Permission denied (13)\n"));
    p1.emit("close", 23, null);

    await vi.waitFor(() => {
      const task = service.list()[0];
      expect(task.kind).toBe("download");
      expect(task.status).toBe("failed");
      expect(task.errorCode).toBe("permission_denied");
    });
    expect(remoteDownloadFallback).not.toHaveBeenCalled();
  });
});
