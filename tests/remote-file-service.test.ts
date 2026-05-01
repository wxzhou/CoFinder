import { describe, expect, it, vi } from "vitest";
import { RemoteFileService } from "../src/main/services/RemoteFileService";

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
});
