import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  isDefaultFavoriteId,
  isDuplicateFavoritePath,
  labelForLocalPath,
  mergeResolvedFavorites,
  normalizeLocalPath,
  parseFavoritesFile,
  type LocalFavoriteCustomDisk,
  type LocalFavoriteListItem,
  type LocalFavoriteResolved,
  type LocalSidebarFavoritesFileV1
} from "../../shared/localFavorites";

export type WellKnownPaths = {
  home: string;
  desktop: string;
  downloads: string;
  documents: string;
};

export function defaultLocalSidebarFavoritesPath(userData: string): string {
  return path.join(userData, "local-sidebar-favorites.json");
}

async function pathExistsOnDisk(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function diskForWrite(disk: LocalSidebarFavoritesFileV1): LocalSidebarFavoritesFileV1 {
  const out: LocalSidebarFavoritesFileV1 = { version: 1, custom: disk.custom };
  if (disk.hiddenDefaultIds?.length) out.hiddenDefaultIds = disk.hiddenDefaultIds;
  return out;
}

export class LocalSidebarFavoritesRepository {
  constructor(
    private readonly filePath: string,
    private readonly getWellKnown: () => WellKnownPaths
  ) {}

  async loadDiskSafe(): Promise<LocalSidebarFavoritesFileV1> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      try {
        return parseFavoritesFile(raw);
      } catch {
        console.error("[LocalSidebarFavoritesRepository] Corrupt favorites file; using empty custom list.");
        return { version: 1, custom: [] };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return { version: 1, custom: [] };
      console.error("[LocalSidebarFavoritesRepository] Failed to read favorites file.", { code });
      return { version: 1, custom: [] };
    }
  }

  private async saveDisk(disk: LocalSidebarFavoritesFileV1): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(diskForWrite(disk), null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }

  private async annotateExists(rows: LocalFavoriteResolved[]): Promise<LocalFavoriteListItem[]> {
    const out: LocalFavoriteListItem[] = [];
    for (const r of rows) {
      out.push({ ...r, pathExists: await pathExistsOnDisk(r.path) });
    }
    return out;
  }

  private mergedResolved(disk: LocalSidebarFavoritesFileV1): LocalFavoriteResolved[] {
    const wk = this.getWellKnown();
    return mergeResolvedFavorites(wk, disk.custom, disk.hiddenDefaultIds ?? []);
  }

  async listRows(): Promise<LocalFavoriteListItem[]> {
    const disk = await this.loadDiskSafe();
    return this.annotateExists(this.mergedResolved(disk));
  }

  async addPath(absPath: string): Promise<LocalFavoriteListItem[]> {
    const normalized = normalizeLocalPath(absPath);
    const disk = await this.loadDiskSafe();
    const merged = this.mergedResolved(disk);
    if (isDuplicateFavoritePath(normalized, merged)) {
      const err = new Error("DUPLICATE");
      (err as Error & { code: string }).code = "LOCAL_FAVORITES_DUPLICATE";
      throw err;
    }
    const row: LocalFavoriteCustomDisk = {
      id: randomUUID(),
      label: labelForLocalPath(normalized),
      path: normalized,
      createdAt: Date.now()
    };
    const next: LocalSidebarFavoritesFileV1 = {
      version: 1,
      custom: [...disk.custom, row],
      hiddenDefaultIds: disk.hiddenDefaultIds
    };
    await this.saveDisk(next);
    return this.listRows();
  }

  async removeById(id: string): Promise<LocalFavoriteListItem[]> {
    const disk = await this.loadDiskSafe();
    if (isDefaultFavoriteId(id)) {
      const nextHidden = [...new Set([...(disk.hiddenDefaultIds ?? []), id])];
      await this.saveDisk({ version: 1, custom: disk.custom, hiddenDefaultIds: nextHidden });
      return this.listRows();
    }
    const nextCustom = disk.custom.filter((c) => c.id !== id);
    if (nextCustom.length === disk.custom.length) {
      const err = new Error("NOT_FOUND");
      (err as Error & { code: string }).code = "LOCAL_FAVORITES_NOT_FOUND";
      throw err;
    }
    await this.saveDisk({
      version: 1,
      custom: nextCustom,
      hiddenDefaultIds: disk.hiddenDefaultIds
    });
    return this.listRows();
  }

  /** Show all built-in favorites again (does not remove custom entries). */
  async resetDefaultLocations(): Promise<LocalFavoriteListItem[]> {
    const disk = await this.loadDiskSafe();
    await this.saveDisk({ version: 1, custom: disk.custom });
    return this.listRows();
  }
}
