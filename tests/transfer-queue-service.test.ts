import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { TransferQueueService } from "../src/main/services/TransferQueueService";
import type { EnqueueDownloadRequest, EnqueueUploadRequest } from "../src/shared/types/ipc";

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
    pathExists: async () => options?.pathExists ?? true
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

  it("fails task when ssh BatchMode preflight fails", async () => {
    const { service } = createService({
      runCommand: async (command) => {
        if (command === "ssh") return { ok: false, message: "SSH key/passwordless login required for rsync transfer." };
        return { ok: true };
      }
    });
    await service.enqueueUpload(baseUpload);
    await vi.waitFor(() => {
      expect(service.list()[0].status).toBe("failed");
      expect(service.list()[0].error).toContain("SSH key/passwordless login required");
      expect(service.list()[0].errorCode).toBe("ssh_batchmode_failed");
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
});
