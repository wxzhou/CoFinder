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
