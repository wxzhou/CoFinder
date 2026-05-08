import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSidebarFavoritesRepository } from "../src/main/services/LocalSidebarFavoritesRepository";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-lfav-"));
  tempDirs.push(dir);
  const home = path.join(dir, "home");
  const desktop = path.join(home, "Desktop");
  const downloads = path.join(home, "Downloads");
  const documents = path.join(home, "Documents");
  await fs.mkdir(desktop, { recursive: true });
  await fs.mkdir(downloads, { recursive: true });
  await fs.mkdir(documents, { recursive: true });
  const wellKnown = { home, desktop, downloads, documents };
  const filePath = path.join(dir, "local-sidebar-favorites.json");
  const repo = new LocalSidebarFavoritesRepository(filePath, () => wellKnown);
  return { repo, filePath, home, desktop, extra: path.join(home, "extra"), wellKnown };
}

describe("LocalSidebarFavoritesRepository", () => {
  it("lists defaults when file missing", async () => {
    const { repo, home, desktop } = await makeRepo();
    const rows = await repo.listRows();
    expect(rows.find((r) => r.id === "home")?.path).toBe(home);
    expect(rows.find((r) => r.id === "desktop")?.path).toBe(desktop);
    expect(rows.every((r) => r.pathExists)).toBe(true);
  });

  it("adds custom path and rejects duplicate", async () => {
    const { repo, extra } = await makeRepo();
    await fs.mkdir(extra, { recursive: true });
    const after = await repo.addPath(extra);
    expect(after.some((r) => r.path === extra && !r.isDefault)).toBe(true);
    await expect(repo.addPath(extra)).rejects.toMatchObject({ code: "LOCAL_FAVORITES_DUPLICATE" });
  });

  it("removes custom and hides default by id", async () => {
    const { repo, extra, home } = await makeRepo();
    await fs.mkdir(extra, { recursive: true });
    const afterAdd = await repo.addPath(extra);
    const custom = afterAdd.find((r) => r.path === extra);
    expect(custom).toBeTruthy();
    const afterRm = await repo.removeById(custom!.id);
    expect(afterRm.some((r) => r.path === extra)).toBe(false);
    const afterHideHome = await repo.removeById("home");
    expect(afterHideHome.some((r) => r.id === "home")).toBe(false);
    const rowsAgain = await repo.listRows();
    expect(rowsAgain.some((r) => r.path === home)).toBe(false);
    const afterRestore = await repo.resetDefaultLocations();
    expect(afterRestore.find((r) => r.id === "home")?.path).toBe(home);
  });

  it("rejects remove of unknown id", async () => {
    const { repo } = await makeRepo();
    await expect(repo.removeById("not-a-uuid")).rejects.toMatchObject({ code: "LOCAL_FAVORITES_NOT_FOUND" });
  });

  it("falls back when file is corrupt JSON", async () => {
    const { repo, filePath, home } = await makeRepo();
    await fs.writeFile(filePath, "{ not json", "utf8");
    const rows = await repo.listRows();
    expect(rows.find((r) => r.id === "home")?.path).toBe(home);
  });

  it("persists custom across load", async () => {
    const { repo, filePath, extra, wellKnown } = await makeRepo();
    await fs.mkdir(extra, { recursive: true });
    await repo.addPath(extra);
    const repo2 = new LocalSidebarFavoritesRepository(filePath, () => wellKnown);
    const rows = await repo2.listRows();
    expect(rows.some((r) => r.path === extra)).toBe(true);
  });

  it("reorders custom favorites", async () => {
    const { repo, home } = await makeRepo();
    const firstPath = path.join(home, "first");
    const secondPath = path.join(home, "second");
    await fs.mkdir(firstPath, { recursive: true });
    await fs.mkdir(secondPath, { recursive: true });
    await repo.addPath(firstPath);
    await repo.addPath(secondPath);
    let rows = await repo.listRows();
    const first = rows.find((r) => r.path === firstPath)!;
    const second = rows.find((r) => r.path === secondPath)!;

    rows = await repo.reorderById(second.id, "up");
    const custom = rows.filter((r) => !r.isDefault);
    expect(custom.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});
