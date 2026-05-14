import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

describe("RemoteEditService", () => {
  beforeEach(() => {
    spawnMock.mockClear();
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit("exit", 0));
      return child;
    });
  });

  it("downloads a sniffed text file into the edit cache and opens the configured editor", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi.fn(async () => ({ type: "-", size: 22, modifyTime: 1234 })),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, "chr1\t100\t200\tpeak_1\n", "utf8");
      })
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );

    const session = await service.openTextEditSession(
      { tabId: "tab", connectionId: "c1", remotePath: "/data/sample.bed" },
      { textEditor: "TextMate" }
    );

    expect(session.state).toBe("clean");
    expect(session.remotePath).toBe("/data/sample.bed");
    expect(session.localPath).toContain(`${path.sep}remote-edit${path.sep}`);
    expect(await fs.readFile(session.localPath, "utf8")).toContain("peak_1");
    expect(spawnMock).toHaveBeenCalledWith("open", ["-a", "TextMate", expect.any(String)], { stdio: "ignore" });

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("rejects binary-looking files before creating an edit session", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi.fn(async () => ({ type: "-", size: 4, modifyTime: 1234 })),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, Buffer.from([0x00, 0x01, 0x02, 0xff]));
      })
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );

    await expect(service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/data/blob.bin" })).rejects.toMatchObject({
      code: "REMOTE_PREVIEW_UNSUPPORTED"
    });
    expect(service.listSessions()).toHaveLength(0);
    expect(spawnMock).not.toHaveBeenCalled();

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("uploads a changed local edit copy after confirming the remote baseline is unchanged", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi
        .fn()
        .mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 })
        .mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 })
        .mockResolvedValueOnce({ type: "-", size: 19, modifyTime: 2000 }),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, "remote text\n", "utf8");
      }),
      put: vi.fn(async () => undefined)
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );
    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/note.txt" });
    await fs.writeFile(session.localPath, "changed remote text\n", "utf8");

    const uploaded = await service.syncSession(session.id);

    expect(uploaded.state).toBe("uploaded");
    expect(uploaded.baseline).toEqual({ size: 19, modifyTime: 2000 });
    expect(client.put).toHaveBeenCalledWith(session.localPath, "/note.txt");

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("marks conflict and preserves the local edit copy when the remote file changed first", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi.fn().mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 }).mockResolvedValueOnce({
        type: "-",
        size: 20,
        modifyTime: 3000
      }),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, "remote text\n", "utf8");
      }),
      put: vi.fn(async () => undefined)
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );
    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/note.txt" });
    await fs.writeFile(session.localPath, "my local edit\n", "utf8");

    const conflict = await service.syncSession(session.id);

    expect(conflict.state).toBe("conflict");
    expect(conflict.error).toContain("Remote file changed");
    expect(client.put).not.toHaveBeenCalled();
    expect(await fs.readFile(session.localPath, "utf8")).toBe("my local edit\n");

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("can re-download or explicitly force-upload a conflicted edit session", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    let remoteText = "remote text\n";
    const client = {
      stat: vi
        .fn()
        .mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 })
        .mockResolvedValueOnce({ type: "-", size: 20, modifyTime: 3000 })
        .mockResolvedValueOnce({ type: "-", size: 20, modifyTime: 3000 })
        .mockResolvedValueOnce({ type: "-", size: 15, modifyTime: 4000 }),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, remoteText, "utf8");
      }),
      put: vi.fn(async (localPath: string) => {
        remoteText = await fs.readFile(localPath, "utf8");
      })
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );
    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/note.txt" });
    await fs.writeFile(session.localPath, "my local edit\n", "utf8");
    const conflict = await service.syncSession(session.id);
    expect(conflict.state).toBe("conflict");

    remoteText = "new remote version\n";
    const clean = await service.redownloadSession(session.id);
    expect(clean.state).toBe("clean");
    expect(await fs.readFile(session.localPath, "utf8")).toBe("new remote version\n");

    await fs.writeFile(session.localPath, "force my edit\n", "utf8");
    const uploaded = await service.forceUploadSession(session.id);
    expect(uploaded.state).toBe("uploaded");
    expect(remoteText).toBe("force my edit\n");

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("closes a session and discards the local edit copy only after an explicit call", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi.fn(async () => ({ type: "-", size: 12, modifyTime: 1000 })),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, "remote text\n", "utf8");
      })
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );
    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/note.txt" });

    await service.closeSession(session.id, { discardLocal: true });

    expect(service.listSessions()).toHaveLength(0);
    await expect(fs.stat(session.localPath)).rejects.toMatchObject({ code: "ENOENT" });

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("retries a failed upload with Save Back Now even when the local file is unchanged", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi
        .fn()
        .mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 })
        .mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 })
        .mockResolvedValueOnce({ type: "-", size: 12, modifyTime: 1000 })
        .mockResolvedValueOnce({ type: "-", size: 14, modifyTime: 2000 }),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, "remote text\n", "utf8");
      }),
      put: vi.fn().mockRejectedValueOnce(new Error("Permission denied")).mockResolvedValueOnce(undefined)
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );
    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/note.txt" });
    await fs.writeFile(session.localPath, "retry content\n", "utf8");

    const failed = await service.syncSession(session.id);
    const retried = await service.syncSession(session.id);

    expect(failed.state).toBe("failed");
    expect(retried.state).toBe("uploaded");
    expect(client.put).toHaveBeenCalledTimes(2);

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("marks a session failed when the local edit copy is deleted", async () => {
    const { RemoteEditService } = await import("../src/main/services/RemoteEditService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-edit-test-"));
    const client = {
      stat: vi.fn(async () => ({ type: "-", size: 12, modifyTime: 1000 })),
      fastGet: vi.fn(async (_remotePath: string, localPath: string) => {
        await fs.writeFile(localPath, "remote text\n", "utf8");
      }),
      put: vi.fn(async () => undefined)
    };
    const service = new RemoteEditService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );
    const session = await service.openTextEditSession({ tabId: "tab", connectionId: "c1", remotePath: "/note.txt" });
    await fs.unlink(session.localPath);

    const failed = await service.syncSession(session.id);

    expect(failed.state).toBe("failed");
    expect(failed.error).toBe("Local edit copy is missing.");
    expect(client.put).not.toHaveBeenCalled();

    service.closeAll();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
