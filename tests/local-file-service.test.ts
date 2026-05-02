import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileService } from "../src/main/services/LocalFileService";

const tempDirs: string[] = [];

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

    const info = await service.getPathInfo(folder);
    expect(info.type).toBe("directory");
    expect(info.size).toBe(4096);
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
