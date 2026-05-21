import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { RemoteFileService } from "../src/main/services/RemoteFileService";

const gunzipAsync = promisify(gunzip);

function mockExecClient(names: Record<string, string>) {
  const client = { ready: true };
  return {
    ...client,
    exec: vi.fn(function (this: typeof client, command: string, callback: (error: Error | undefined, stream: EventEmitter) => void) {
      if (!this.ready) throw new Error("exec lost this binding");
      const uid = command.match(/id -nu (\d+)/)?.[1] ?? "";
      const stream = new EventEmitter();
      callback(undefined, stream);
      queueMicrotask(() => {
        stream.emit("data", `${names[uid] ?? ""}\n`);
        stream.emit("close", 0);
      });
    })
  };
}

describe("RemoteFileService path/list behavior", () => {
  it("uses POSIX normalization for remote paths", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const stat = vi.fn().mockRejectedValue(new Error("should not call stat on success"));
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/home/alice",
        client: { list, stat }
      })
    } as any);

    const result = await service.listDirectory("c1", "foo/../bar");
    expect(result.path).toBe("/bar");
    expect(list).toHaveBeenCalledWith("/bar");
    expect(stat).not.toHaveBeenCalled();
  });

  it("treats list success as browsable source of truth", async () => {
    const list = vi.fn().mockResolvedValue([
      { name: "a.txt", type: "-", size: 1, modifyTime: Date.now() }
    ]);
    const stat = vi.fn().mockRejectedValue(new Error("stat unavailable"));

    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { list, stat }
      })
    } as any);

    const result = await service.listDirectory("c1", "/data");
    expect(result.entries).toHaveLength(1);
    expect(stat).not.toHaveBeenCalled();
  });

  it("normalizes listed permissions and resolves numeric owners", async () => {
    const execClient = mockExecClient({ "1007": "zhouwenxiong" });
    const list = vi.fn().mockResolvedValue([
      {
        name: "folder",
        type: "d",
        size: 0,
        modifyTime: Date.now(),
        rights: { user: "rwx", group: "rx", other: "rx" },
        owner: 1007
      },
      {
        name: "file.txt",
        type: "-",
        size: 1,
        modifyTime: Date.now(),
        rights: { user: "rw", group: "r", other: "r" },
        owner: 1007
      }
    ]);
    const stat = vi.fn().mockRejectedValue(new Error("stat unavailable"));
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { list, stat, client: execClient }
      })
    } as any);

    const result = await service.listDirectory("c1", "/data");
    expect(result.entries.map((entry) => entry.permissions)).toEqual(["rwxr-xr-x", "rw-r--r--"]);
    expect(result.entries.map((entry) => entry.owner)).toEqual(["zhouwenxiong", "zhouwenxiong"]);
    expect(execClient.exec).toHaveBeenCalledTimes(1);
  });

  it("maps missing initial path to NOT_FOUND instead of auth failure", async () => {
    const list = vi.fn().mockRejectedValue(new Error("No such file or directory"));
    const stat = vi.fn().mockRejectedValue(new Error("No such file"));

    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { list, stat }
      })
    } as any);

    await expect(service.listDirectory("c1", "/missing")).rejects.toMatchObject({ code: "REMOTE_NOT_FOUND" });
  });

  it("drops stale connections when listing reports a lost connection", async () => {
    const list = vi.fn().mockRejectedValue(new Error("No response from server"));
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { list }
      }),
      disconnect
    } as any);

    await expect(service.listDirectory("c1", "/data")).rejects.toMatchObject({ code: "REMOTE_DISCONNECTED" });
    expect(disconnect).toHaveBeenCalledWith("c1");
  });

  it("renames remote path and returns destination path", async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { rename }
      })
    } as any);

    await expect(service.renamePath("c1", "/a/old.txt", "new.txt")).resolves.toBe("/a/new.txt");
    expect(rename).toHaveBeenCalledWith("/a/old.txt", "/a/new.txt");
  });

  it("rejects invalid new name for remote rename", async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { rename }
      })
    } as any);

    await expect(service.renamePath("c1", "/a/old.txt", "bad/name")).rejects.toMatchObject({ code: "REMOTE_INVALID_INPUT" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("maps collision error in remote rename", async () => {
    const rename = vi.fn().mockRejectedValue(new Error("EEXIST: file already exists"));
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { rename }
      })
    } as any);

    await expect(service.renamePath("c1", "/a/old.txt", "new.txt")).rejects.toMatchObject({ code: "REMOTE_RENAME_FAILED" });
  });

  it("deletes remote file and directory recursively", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/dir") return { type: "d" };
      if (target === "/dir/child.txt") return { type: "-" };
      if (target === "/file.txt") return { type: "-" };
      throw new Error("No such file");
    });
    const list = vi.fn(async (target: string) => {
      if (target === "/dir") return [{ name: "child.txt", type: "-", size: 1, modifyTime: Date.now() }];
      return [];
    });
    const del = vi.fn().mockResolvedValue(undefined);
    const rmdir = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list, delete: del, rmdir }
      })
    } as any);

    await expect(service.deletePaths("c1", ["/file.txt", "/dir"])).resolves.toBe(2);
    expect(del).toHaveBeenCalledWith("/file.txt");
    expect(del).toHaveBeenCalledWith("/dir/child.txt");
    expect(rmdir).toHaveBeenCalledWith("/dir");
  });

  it("deletes remote folders when stat returns numeric directory type", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/dir") return { type: 2, mode: 0o040755 };
      if (target === "/dir/child.txt") return { type: 1, mode: 0o100644 };
      throw new Error("No such file");
    });
    const list = vi.fn(async (target: string) => {
      if (target === "/dir") return [{ name: "child.txt", type: "-", size: 1, modifyTime: Date.now() }];
      return [];
    });
    const del = vi.fn().mockResolvedValue(undefined);
    const rmdir = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list, delete: del, rmdir }
      })
    } as any);

    await expect(service.deletePaths("c1", ["/dir"])).resolves.toBe(1);
    expect(del).toHaveBeenCalledWith("/dir/child.txt");
    expect(rmdir).toHaveBeenCalledWith("/dir");
  });

  it("creates a unique remote text file without overwriting existing files", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/work/Untitled.txt") return { type: "-", size: 3, modifyTime: Date.now() };
      throw new Error("No such file");
    });
    const put = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, put }
      })
    } as any);

    await expect(service.createTextFile("c1", "/work")).resolves.toBe("/work/Untitled 2.txt");
    expect(put).toHaveBeenCalledWith(Buffer.from(""), "/work/Untitled 2.txt");
  });

  it("rejects invalid remote text file names before uploading", async () => {
    const stat = vi.fn().mockRejectedValue(new Error("No such file"));
    const put = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, put }
      })
    } as any);

    await expect(service.createTextFile("c1", "/work", "bad/name.txt")).rejects.toMatchObject({ code: "REMOTE_INVALID_INPUT" });
    await expect(service.createTextFile("c1", "/work", "bad\nname.txt")).rejects.toMatchObject({ code: "REMOTE_INVALID_INPUT" });
    expect(put).not.toHaveBeenCalled();
  });

  it("maps remote delete missing path to REMOTE_NOT_FOUND", async () => {
    const stat = vi.fn().mockRejectedValue(new Error("No such file or directory"));
    const list = vi.fn().mockResolvedValue([]);
    const del = vi.fn().mockResolvedValue(undefined);
    const rmdir = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list, delete: del, rmdir }
      })
    } as any);

    await expect(service.deletePaths("c1", ["/missing"])).rejects.toMatchObject({ code: "REMOTE_NOT_FOUND" });
  });

  it("returns remote path info", async () => {
    const execClient = mockExecClient({ "1000": "alice" });
    const stat = vi.fn().mockResolvedValue({
      type: "-",
      size: 42,
      modifyTime: Date.now(),
      rights: { user: "rw", group: "r", other: "" },
      owner: 1000,
      group: 100
    });
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, client: execClient }
      })
    } as any);

    const info = await service.getPathInfo("c1", "/a/file.txt");
    expect(info.name).toBe("file.txt");
    expect(info.fullPath).toBe("/a/file.txt");
    expect(info.type).toBe("file");
    expect(info.size).toBe(42);
    expect(info.permissions).toBe("rw-r-----");
    expect(info.owner).toBe("alice");
    expect(info.group).toBe("100");
  });

  it("compresses a remote file to gzip without overwriting target", async () => {
    const remoteFiles = new Map<string, Buffer>([
      ["/a/file.txt", Buffer.from("remote gzip\n")]
    ]);
    const stat = vi.fn(async (target: string) => {
      if (!remoteFiles.has(target)) throw new Error("No such file");
      return { type: "-", size: remoteFiles.get(target)?.length ?? 0, modifyTime: Date.now() };
    });
    const get = vi.fn(async (remotePath: string, localPath?: string) => {
      const data = remoteFiles.get(remotePath);
      if (!data) throw new Error("No such file");
      if (localPath) {
        await fs.writeFile(localPath, data);
        return undefined;
      }
      return data;
    });
    const put = vi.fn(async (localPath: string, remotePath: string) => {
      remoteFiles.set(remotePath, await fs.readFile(localPath));
    });
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, get, put }
      })
    } as any);

    const compressedPath = await service.compressFileGzip("c1", "/a/file.txt");
    expect(compressedPath).toBe("/a/file.txt.gz");
    expect(await gunzipAsync(remoteFiles.get("/a/file.txt.gz")!)).toEqual(Buffer.from("remote gzip\n"));
    await expect(service.compressFileGzip("c1", "/a/file.txt")).rejects.toMatchObject({ code: "REMOTE_COMPRESS_FAILED" });
  });

  it("cleans remote gzip temp files after compression", async () => {
    const before = new Set(await fs.readdir(os.tmpdir()));
    const stat = vi.fn(async (target: string) => {
      if (target === "/a/file.txt") return { type: "-", size: 1, modifyTime: Date.now() };
      throw new Error("No such file");
    });
    const get = vi.fn(async (_remotePath: string, localPath?: string) => {
      if (localPath) await fs.writeFile(localPath, "x");
    });
    const put = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, get, put }
      })
    } as any);

    await service.compressFileGzip("c1", "/a/file.txt");
    const after = await fs.readdir(os.tmpdir());
    expect(after.filter((item) => item.startsWith("cofinder-remote-gzip-") && !before.has(item))).toHaveLength(0);
  });

  it("fills path info owner from parent listing when stat omits owner", async () => {
    const execClient = mockExecClient({ "1007": "zhouwenxiong" });
    const stat = vi.fn().mockResolvedValue({
      type: "-",
      size: 42,
      modifyTime: Date.now()
    });
    const list = vi.fn().mockResolvedValue([
      {
        name: "file.txt",
        type: "-",
        size: 42,
        modifyTime: Date.now(),
        rights: { user: "rw", group: "r", other: "r" },
        owner: 1007
      }
    ]);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list, client: execClient }
      })
    } as any);

    const info = await service.getPathInfo("c1", "/a/file.txt");
    expect(list).toHaveBeenCalledWith("/a");
    expect(info.owner).toBe("zhouwenxiong");
    expect(info.permissions).toBe("rw-r--r--");
  });

  it("maps get info not found to REMOTE_NOT_FOUND", async () => {
    const stat = vi.fn().mockRejectedValue(new Error("No such file or directory"));
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat }
      })
    } as any);

    await expect(service.getPathInfo("c1", "/missing")).rejects.toMatchObject({ code: "REMOTE_NOT_FOUND" });
  });

  it("maps remote directory type and recursive size", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/dir") return { type: 2, mode: 0o040755, size: 0, modifyTime: Date.now() };
      if (target === "/dir/a.txt") return { type: 1, mode: 0o100644, size: 1024, modifyTime: Date.now() };
      if (target === "/dir/sub") return { type: 2, mode: 0o040755, size: 0, modifyTime: Date.now() };
      throw new Error("No such file");
    });
    const list = vi.fn(async (target: string) => {
      if (target === "/dir") return [
        { name: "a.txt", type: "-", size: 1024, modifyTime: Date.now() },
        { name: "sub", type: "d", size: 0, modifyTime: Date.now() }
      ];
      if (target === "/dir/sub") return [];
      return [];
    });
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list }
      })
    } as any);

    const info = await service.getPathInfo("c1", "/dir");
    expect(info.type).toBe("directory");
    expect(info.size).toBe(1024);
    expect(info.permissions).toBe("rwxr-xr-x");
    expect(info.fileCount).toBe(1);
    expect(info.folderCount).toBe(1);
  });

  it("can skip recursive size calculation for remote directory", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/dir") return { type: 2, mode: 0o040755, size: 4096, modifyTime: Date.now() };
      throw new Error("No such file");
    });
    const list = vi.fn().mockResolvedValue([]);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list }
      })
    } as any);

    const info = await service.getPathInfo("c1", "/dir", { includeDirectorySize: false });
    expect(info.type).toBe("directory");
    expect(info.size).toBe(4096);
    expect(info.fileCount).toBe(0);
    expect(info.folderCount).toBe(0);
    expect(list).toHaveBeenCalledWith("/dir");
  });

  it("creates a remote directory under the current folder", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { mkdir }
      })
    } as any);

    await expect(service.makeDirectory("c1", "/work", "new folder")).resolves.toBe("/work/new folder");
    expect(mkdir).toHaveBeenCalledWith("/work/new folder");
  });

  it("changes remote permissions with numeric mode", async () => {
    const chmod = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { chmod }
      })
    } as any);

    await expect(service.chmodPath("c1", "/work/a.txt", 0o640)).resolves.toBeUndefined();
    expect(chmod).toHaveBeenCalledWith("/work/a.txt", 0o640);
  });

  it("duplicates a remote file with copy suffix", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/work/a.txt") return { type: "-", size: 3, modifyTime: Date.now() };
      throw new Error("No such file");
    });
    const get = vi.fn().mockResolvedValue(Buffer.from("abc"));
    const put = vi.fn().mockResolvedValue(undefined);
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, get, put }
      })
    } as any);

    await expect(service.duplicateFile("c1", "/work/a.txt")).resolves.toBe("/work/a copy.txt");
    expect(get).toHaveBeenCalledWith("/work/a.txt");
    expect(put).toHaveBeenCalledWith(Buffer.from("abc"), "/work/a copy.txt");
  });

  it("calculates directory size with a traversal cap", async () => {
    const stat = vi.fn(async (target: string) => {
      if (target === "/dir") return { type: "d", mode: 0o040755, size: 0, modifyTime: Date.now() };
      throw new Error("No such file");
    });
    const list = vi.fn(async (target: string) => {
      if (target === "/dir") {
        return [
          { name: "a.txt", type: "-", size: 3, modifyTime: Date.now() },
          { name: "b.txt", type: "-", size: 5, modifyTime: Date.now() }
        ];
      }
      return [];
    });
    const service = new RemoteFileService({
      getConnection: () => ({
        id: "c1",
        homePath: "/",
        client: { stat, list }
      })
    } as any);

    const result = await service.calculateDirectorySize("c1", "/dir", { maxEntries: 1 });
    expect(result.size).toBe(3);
    expect(result.capped).toBe(true);
  });
});
