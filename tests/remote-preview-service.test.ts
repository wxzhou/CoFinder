import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(async () => "")
  }
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

describe("sniffPreviewKind", () => {
  it("detects text without relying on extension", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from("#!/bin/sh\necho hello\n", "utf8"))).toBe("text");
  });

  it("detects BED and tab-delimited text by content", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from("chr1\t100\t200\tpeak_1\nchr2\t300\t500\tpeak_2\n", "utf8"))).toBe("text");
  });

  it("detects UTF-8 text", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from("第一行\tvalue\nsecond line\n", "utf8"))).toBe("text");
  });

  it("rejects binary-looking content", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from([0x00, 0x01, 0x02, 0xff]))).toBeNull();
  });

  it("rejects binary data without NUL when it is not valid UTF-8", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa]))).toBeNull();
  });

  it("detects common image magic bytes", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image");
    expect(sniffPreviewKind(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe("image");
  });
});

describe("RemotePreviewService", () => {
  beforeEach(() => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit("exit", 0));
      return child;
    });
  });

  it("redownloads when local cached copy was modified even if remote timestamp is unchanged", async () => {
    const { RemotePreviewService } = await import("../src/main/services/RemotePreviewService");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-preview-test-"));
    let downloadCount = 0;
    const client = {
      stat: vi.fn(async () => ({ type: "-", size: 12, modifyTime: 1234 })),
      fastGet: vi.fn(async (_remote: string, local: string) => {
        downloadCount += 1;
        await fs.writeFile(local, "remote text\n", "utf8");
      })
    };
    const service = new RemotePreviewService(
      {
        getConnection: () => ({ id: "c1", client, homePath: "/", config: {} })
      } as any,
      dir
    );

    const first = await service.openPreview({ tabId: "tab", connectionId: "c1", remotePath: "/note" });
    await fs.chmod(path.dirname(first.localPath), 0o755);
    await fs.chmod(first.localPath, 0o644);
    await fs.writeFile(first.localPath, "local edit\n", "utf8");

    const second = await service.openPreview({ tabId: "tab", connectionId: "c1", remotePath: "/note" });
    expect(downloadCount).toBe(2);
    expect(await fs.readFile(second.localPath, "utf8")).toBe("remote text\n");
    expect(spawnMock).toHaveBeenCalledWith("open", ["-t", expect.any(String)], { stdio: "ignore" });

    await service.clearAll();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
