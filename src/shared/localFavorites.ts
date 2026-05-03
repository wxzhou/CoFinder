/** Stable ids for built-in favorites (not UUIDs). */
export const LOCAL_FAVORITE_DEFAULT_IDS = ["home", "desktop", "downloads", "documents"] as const;
export type LocalFavoriteDefaultId = (typeof LOCAL_FAVORITE_DEFAULT_IDS)[number];

export function isDefaultFavoriteId(id: string): id is LocalFavoriteDefaultId {
  return (LOCAL_FAVORITE_DEFAULT_IDS as readonly string[]).includes(id);
}

export type LocalFavoriteCustomDisk = {
  id: string;
  label: string;
  path: string;
  createdAt: number;
};

export type LocalSidebarFavoritesFileV1 = {
  version: 1;
  custom: LocalFavoriteCustomDisk[];
  /** Built-in rows (home/desktop/downloads/documents) the user chose to hide. */
  hiddenDefaultIds?: string[];
};

export type LocalFavoriteResolved = {
  id: string;
  label: string;
  path: string;
  isDefault: boolean;
  createdAt?: number;
};

/** Resolved row returned to renderer (existence from main `fs.access`). */
export type LocalFavoriteListItem = LocalFavoriteResolved & { pathExists: boolean };

/** Collapse slashes, trim; root stays `/`; strip trailing slash for non-root. */
export function normalizeLocalPath(p: string): string {
  let x = (p || "").trim().replace(/\/+/g, "/");
  if (!x) return "/";
  if (x !== "/" && x.endsWith("/")) x = x.slice(0, -1) || "/";
  return x;
}

export function pathsAreSameFavorite(a: string, b: string): boolean {
  return normalizeLocalPath(a) === normalizeLocalPath(b);
}

export function buildDefaultFavorites(wk: {
  home: string;
  desktop: string;
  downloads: string;
  documents: string;
}): LocalFavoriteResolved[] {
  return [
    { id: "home", label: "Home", path: normalizeLocalPath(wk.home), isDefault: true },
    { id: "desktop", label: "Desktop", path: normalizeLocalPath(wk.desktop), isDefault: true },
    { id: "downloads", label: "Downloads", path: normalizeLocalPath(wk.downloads), isDefault: true },
    { id: "documents", label: "Documents", path: normalizeLocalPath(wk.documents), isDefault: true }
  ];
}

export function mergeResolvedFavorites(
  wellKnown: { home: string; desktop: string; downloads: string; documents: string },
  custom: LocalFavoriteCustomDisk[],
  hiddenDefaultIds: readonly string[] = []
): LocalFavoriteResolved[] {
  const hidden = new Set<string>(hiddenDefaultIds.filter(isDefaultFavoriteId));
  const defaults = buildDefaultFavorites(wellKnown).filter((d) => !hidden.has(d.id));
  const customs: LocalFavoriteResolved[] = custom.map((c) => ({
    id: c.id,
    label: c.label,
    path: normalizeLocalPath(c.path),
    isDefault: false,
    createdAt: c.createdAt
  }));
  customs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return [...defaults, ...customs];
}

/** True if `candidatePath` is already listed (normalized equality). */
export function isDuplicateFavoritePath(candidatePath: string, favorites: { path: string }[]): boolean {
  const n = normalizeLocalPath(candidatePath);
  return favorites.some((f) => normalizeLocalPath(f.path) === n);
}

/**
 * Longest-prefix active favorite: exact match wins; else deepest directory prefix.
 * Root `/` matches everything but is shortest — longer paths win when both match.
 */
export function pickActiveFavoriteId(currentPath: string, favorites: { id: string; path: string }[]): string | null {
  const nc = normalizeLocalPath(currentPath);
  let bestId: string | null = null;
  let bestLen = -1;

  for (const f of favorites) {
    const nf = normalizeLocalPath(f.path);
    const exact = nc === nf;
    const under = nf === "/" ? nc !== "/" && nc.startsWith("/") : nc === nf || nc.startsWith(`${nf}/`);
    if (!exact && !under) continue;
    const len = nf.length;
    if (len > bestLen) {
      bestLen = len;
      bestId = f.id;
    }
  }
  return bestId;
}

export function labelForLocalPath(absPath: string): string {
  const n = normalizeLocalPath(absPath);
  if (n === "/") return "Macintosh HD";
  const parts = n.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? n;
}

export function sanitizeCustomDiskEntry(raw: unknown): LocalFavoriteCustomDisk | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 256) : null;
  const p = typeof o.path === "string" && o.path.trim() ? o.path.trim() : null;
  const createdAt = typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  if (!id || !label || !p) return null;
  if (isDefaultFavoriteId(id)) return null;
  return { id, label, path: p, createdAt };
}

export function parseFavoritesFile(raw: string): LocalSidebarFavoritesFileV1 {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid root");
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== 1) throw new Error("bad version");
  if (!Array.isArray(o.custom)) throw new Error("bad custom");
  const custom: LocalFavoriteCustomDisk[] = [];
  for (const item of o.custom) {
    const row = sanitizeCustomDiskEntry(item);
    if (row) custom.push(row);
  }
  let hiddenDefaultIds: string[] | undefined;
  if (Array.isArray(o.hiddenDefaultIds)) {
    const h: string[] = [];
    for (const x of o.hiddenDefaultIds) {
      if (typeof x !== "string") continue;
      const t = x.trim();
      if (isDefaultFavoriteId(t)) h.push(t);
    }
    if (h.length) hiddenDefaultIds = [...new Set(h)];
  }
  return hiddenDefaultIds?.length ? { version: 1, custom, hiddenDefaultIds } : { version: 1, custom };
}
