import type { FileEntry } from "../shared/types/models";

export const MAX_RECENT_PATHS = 12;

export type RecentPath = {
  path: string;
  label: string;
  visitedAt: number;
};

export function normalizeNavPath(input: string): string {
  const trimmed = (input || "").trim().replace(/\/+/g, "/");
  if (!trimmed) return "/";
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}

export function labelForNavPath(input: string): string {
  const normalized = normalizeNavPath(input);
  if (normalized === "/") return "/";
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

export function filterEntriesByName<T extends FileEntry>(entries: T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle));
}

export function addRecentPath(list: RecentPath[], targetPath: string, now = Date.now(), max = MAX_RECENT_PATHS): RecentPath[] {
  const normalized = normalizeNavPath(targetPath);
  const deduped = list.filter((item) => normalizeNavPath(item.path) !== normalized);
  return [{ path: normalized, label: labelForNavPath(normalized), visitedAt: now }, ...deduped].slice(0, max);
}

export function buildPathSuggestions(input: string, candidates: readonly string[], limit = 8): string[] {
  const needle = normalizeNavPath(input).toLocaleLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const normalized = normalizeNavPath(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (needle !== "/" && !normalized.toLocaleLowerCase().startsWith(needle)) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}
