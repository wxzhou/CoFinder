import type { PathInfo } from "../../shared/types/ipc";

export function pathInfoKindLabel(type: PathInfo["type"]): string {
  switch (type) {
    case "directory":
      return "Folder";
    case "file":
      return "Document";
    case "symlink":
      return "Symbolic link";
    default:
      return "Item";
  }
}

export function pathInfoNeedsDirectoryDetails(info: Pick<PathInfo, "type">): boolean {
  return info.type === "directory";
}

export function entriesMatchingPaths<T extends { fullPath: string }>(paths: string[], entries: T[]): T[] {
  const set = new Set(paths);
  return entries.filter((e) => set.has(e.fullPath));
}

export function multiSelectionFileBytes(paths: string[], entries: Array<{ fullPath: string; size: number; type: string }>): number {
  return entriesMatchingPaths(paths, entries)
    .filter((e) => e.type !== "directory")
    .reduce((acc, e) => acc + e.size, 0);
}

export function multiSelectionPreviewNames(
  paths: string[],
  entries: Array<{ fullPath: string; name: string }>,
  max = 4
): string[] {
  return entriesMatchingPaths(paths, entries)
    .slice(0, max)
    .map((e) => e.name);
}
