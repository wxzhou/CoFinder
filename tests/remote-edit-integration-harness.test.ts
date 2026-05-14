import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

function mockOpen(): void {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit("exit", 0));
    return child;
  });
}

function createFakeRemote(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  let clock = 1000;
  const mtimes = new Map(Object.keys(initial).map((key) => [key, clock]));
  return {
    client: {
      stat: vi.fn(async (remotePath: string) => ({
        type: "-",
        size: Buffer.byteLength(files.get(remotePath) ?? ""),
        modifyTime: mtimes.get(remotePath) ?? 0
      })),
      fastGet: vi.fn(async (remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, files.get(remotePath) ?? "", "utf8");
      }),
      put: vi.fn(async (localPath: string, remotePath: string) => {
        files.set(remotePath, await fs.readFile(localPath, "utf8"));
        clock += 1000;
        mtimes.set(remotePath, clock);
      })
    },
    writeRemote(remotePath: string, text: string) {
      files.set(remotePath, text);
      clock += 1000;
      mtimes.set(remotePath, clock);
    },
    readRemote(remotePath: string): string {
      return files.get(remotePath) ?? "";
    }
  };
}

describe("remote edit integration harness", () => {
  it("covers happy-path edit upload against a fake SFTP root", async () => {
    mockOpen();
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-harness-"));
    const remote = createFakeRemote({ "/root/note.txt": "hello\n" });
    const service = new RemoteEditService({ getConnection: () => ({ id: "c1", client: remote.client }) } as any, dir);

    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/root/note.txt" });
    await fs.writeFile(session.localPath, "hello from local\n", "utf8");
    const uploaded = await service.syncSession(session.id);

    expect(uploaded.state).toBe("uploaded");
    expect(remote.readRemote("/root/note.txt")).toBe("hello from local\n");

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("covers conflict and disconnect paths without touching real remote paths", async () => {
    mockOpen();
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-harness-"));
    const remote = createFakeRemote({ "/root/note.txt": "hello\n" });
    let connected = true;
    const service = new RemoteEditService(
      { getConnection: () => (connected ? ({ id: "c1", client: remote.client } as any) : null) } as any,
      dir
    );

    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/root/note.txt" });
    remote.writeRemote("/root/note.txt", "remote newer\n");
    await fs.writeFile(session.localPath, "local edit\n", "utf8");
    const conflict = await service.syncSession(session.id);
    connected = false;
    const failed = await service.syncSession(session.id);

    expect(conflict.state).toBe("conflict");
    expect(failed.state).toBe("failed");
    expect(failed.error).toContain("disconnected");

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
