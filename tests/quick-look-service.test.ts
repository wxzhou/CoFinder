import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickLookService } from "../src/main/services/QuickLookService";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-ql-"));
  tempDirs.push(dir);
  return dir;
}

describe("QuickLookService", () => {
  it("launches qlmanage for local file", async () => {
    const unref = vi.fn();
    const spawnLike = vi.fn().mockReturnValue({ unref });
    const service = new QuickLookService(spawnLike as never);
    const dir = await makeTempDir();
    const file = path.join(dir, "a.txt");
    await fs.writeFile(file, "hello");

    await service.previewLocalPath(file);

    expect(spawnLike).toHaveBeenCalledWith("qlmanage", ["-p", file], {
      detached: true,
      stdio: "ignore"
    });
    expect(unref).toHaveBeenCalled();
  });

  it("rejects missing file", async () => {
    const spawnLike = vi.fn().mockReturnValue({ unref: vi.fn() });
    const service = new QuickLookService(spawnLike as never);
    const dir = await makeTempDir();
    const missing = path.join(dir, "missing.txt");

    await expect(service.previewLocalPath(missing)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(spawnLike).not.toHaveBeenCalled();
  });

  it("rejects directory for MVP", async () => {
    const spawnLike = vi.fn().mockReturnValue({ unref: vi.fn() });
    const service = new QuickLookService(spawnLike as never);
    const dir = await makeTempDir();

    await expect(service.previewLocalPath(dir)).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
    expect(spawnLike).not.toHaveBeenCalled();
  });
});
