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

    await fs.rm(dir, { recursive: true, force: true });
  });
});
