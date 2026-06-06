import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileService } from "../src/main/services/LocalFileService";

const tempDirs: string[] = [];
const gunzipAsync = promisify(gunzip);

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-local-rename-"));
  tempDirs.push(dir);
  return dir;
}

describe("LocalFileService renamePath", () => {
  it("renames local entry and returns new full path", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "old.txt");
    await fs.writeFile(source, "hello");

    const renamed = await service.renamePath(source, "new.txt");
    expect(renamed).toBe(path.join(dir, "new.txt"));
    await expect(fs.stat(renamed)).resolves.toBeTruthy();
  });

  it("rejects invalid new name", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "old.txt");
    await fs.writeFile(source, "hello");

    await expect(service.renamePath(source, "bad/name")).rejects.toMatchObject({ code: "RENAME_FAILED" });
  });

  it("maps duplicate target to rename failed", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "old.txt");
    const existing = path.join(dir, "new.txt");
    await fs.writeFile(source, "hello");
    await fs.writeFile(existing, "world");

    await expect(service.renamePath(source, "new.txt")).rejects.toMatchObject({ code: "RENAME_FAILED" });
  });
});

describe("LocalFileService deletePaths", () => {
  it("deletes multiple local entries including directory", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const filePath = path.join(dir, "a.txt");
    const folderPath = path.join(dir, "folder");
    const nested = path.join(folderPath, "b.txt");
    await fs.writeFile(filePath, "a");
    await fs.mkdir(folderPath, { recursive: true });
    await fs.writeFile(nested, "b");

    const deleted = await service.deletePaths([filePath, folderPath]);
    expect(deleted).toBe(2);
    await expect(fs.stat(filePath)).rejects.toBeTruthy();
    await expect(fs.stat(folderPath)).rejects.toBeTruthy();
  });

  it("rejects empty delete request", async () => {
    const service = new LocalFileService();
    await expect(service.deletePaths([])).rejects.toMatchObject({ code: "DELETE_FAILED" });
  });
});

describe("LocalFileService creation", () => {
  it("creates a local directory under the current folder", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();

    const created = await service.makeDirectory(dir, "new folder");
    expect(created).toBe(path.join(dir, "new folder"));
    await expect(fs.stat(created)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("creates unique local text files without overwriting existing files", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "Untitled.txt"), "keep me");

    const created = await service.createTextFile(dir);
    expect(created).toBe(path.join(dir, "Untitled 2.txt"));
    await expect(fs.readFile(path.join(dir, "Untitled.txt"), "utf8")).resolves.toBe("keep me");
    await expect(fs.readFile(created, "utf8")).resolves.toBe("");
  });

  it("rejects invalid local child names", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();

    await expect(service.makeDirectory(dir, "bad/name")).rejects.toMatchObject({ code: "UNKNOWN" });
    await expect(service.createTextFile(dir, "../bad.txt")).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});

describe("LocalFileService compressFileGzip", () => {
  it("compresses a single local file without overwriting existing gzip target", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "data.txt");
    await fs.writeFile(source, "hello gzip\n");

    const compressed = await service.compressFileGzip(source);
    expect(compressed).toBe(`${source}.gz`);
    await expect(gunzipAsync(await fs.readFile(compressed))).resolves.toEqual(Buffer.from("hello gzip\n"));
    await expect(service.compressFileGzip(source)).rejects.toMatchObject({ code: "COMPRESS_FAILED" });
  });

  it("rejects local directories for gzip compression", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    await expect(service.compressFileGzip(dir)).rejects.toMatchObject({ code: "COMPRESS_FAILED" });
  });

  it("deletes the local source after gzip only when requested", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "delete-after.txt");
    await fs.writeFile(source, "remove me after gzip\n");

    const compressed = await service.compressFileGzip(source, { deleteSourceAfterSuccess: true });
    await expect(gunzipAsync(await fs.readFile(compressed))).resolves.toEqual(Buffer.from("remove me after gzip\n"));
    await expect(fs.stat(source)).rejects.toBeTruthy();
  });
});

describe("LocalFileService touchPath", () => {
  it("updates an existing local file timestamp without creating missing paths", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "touch.txt");
    await fs.writeFile(source, "touch me\n");
    const oldDate = new Date("2020-01-01T00:00:00Z");
    await fs.utimes(source, oldDate, oldDate);

    await service.touchPath(source);

    expect((await fs.stat(source)).mtimeMs).toBeGreaterThan(oldDate.getTime());
    await expect(service.touchPath(path.join(dir, "missing.txt"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("LocalFileService listDirectory metadata", () => {
  it("returns rwx permissions and owner names for listed local entries", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const filePath = path.join(dir, "mode.txt");
    await fs.writeFile(filePath, "hello");
    await fs.chmod(filePath, 0o640);

    const listed = await service.listDirectory(dir);
    const entry = listed.entries.find((item) => item.name === "mode.txt");
    expect(entry?.permissions).toBe("rw-r-----");
    expect(entry?.owner).toBeTruthy();
    expect(entry?.owner).not.toMatch(/^\d+$/);
  });
});

describe("LocalFileService getPathInfo", () => {
  it("returns info for a local file", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "info.txt");
    await fs.writeFile(source, "hello");

    const info = await service.getPathInfo(source);
    expect(info.name).toBe("info.txt");
    expect(info.fullPath).toBe(source);
    expect(info.type).toBe("file");
    expect(info.size).toBe(5);
    expect(typeof info.permissions).toBe("string");
  });

  it("returns recursive directory size for local directory", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const folder = path.join(dir, "folder");
    const nested = path.join(folder, "a.bin");
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(nested, Buffer.alloc(4096));
    await fs.mkdir(path.join(folder, "child-folder"));

    const info = await service.getPathInfo(folder);
    expect(info.type).toBe("directory");
    expect(info.size).toBe(4096);
    expect(info.fileCount).toBe(1);
    expect(info.folderCount).toBe(1);
  });

  it("can skip recursive size calculation for local directory", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const folder = path.join(dir, "folder");
    const nested = path.join(folder, "a.bin");
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(nested, Buffer.alloc(4096));

    const info = await service.getPathInfo(folder, { includeDirectorySize: false });
    expect(info.type).toBe("directory");
    expect(info.size).toBeLessThan(4096);
  });

  it("maps missing path in getPathInfo", async () => {
    const service = new LocalFileService();
    const dir = await makeTempDir();
    const source = path.join(dir, "missing.txt");

    await expect(service.getPathInfo(source)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
