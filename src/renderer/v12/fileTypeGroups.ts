import type { FileEntry } from "../../shared/types/models";

export type FileTypeGroup<T extends FileEntry> = {
  id: string;
  label: string;
  entries: T[];
};

const FOLDER_GROUP_ID = "__folders";
const OTHER_GROUP_ID = "__other";

function extensionGroupName(entry: FileEntry): string {
  if (entry.type === "directory") return FOLDER_GROUP_ID;
  const dotIndex = entry.name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === entry.name.length - 1) return OTHER_GROUP_ID;
  return entry.name.slice(dotIndex + 1).toLowerCase();
}

function groupLabel(id: string): string {
  if (id === FOLDER_GROUP_ID) return "Folders";
  if (id === OTHER_GROUP_ID) return "Other";
  return id.toUpperCase();
}

function compareGroupIds(a: string, b: string): number {
  if (a === b) return 0;
  if (a === FOLDER_GROUP_ID) return -1;
  if (b === FOLDER_GROUP_ID) return 1;
  if (a === OTHER_GROUP_ID) return 1;
  if (b === OTHER_GROUP_ID) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function groupEntriesByFileType<T extends FileEntry>(entries: T[]): Array<FileTypeGroup<T>> {
  const byGroup = new Map<string, T[]>();
  for (const entry of entries) {
    const id = extensionGroupName(entry);
    byGroup.set(id, [...(byGroup.get(id) ?? []), entry]);
  }
  return Array.from(byGroup.entries())
    .sort(([a], [b]) => compareGroupIds(a, b))
    .map(([id, groupEntries]) => ({
      id,
      label: groupLabel(id),
      entries: groupEntries
    }));
}

export function flattenFileTypeGroups<T extends FileEntry>(entries: T[]): T[] {
  return groupEntriesByFileType(entries).flatMap((group) => group.entries);
}

export function groupOutlineRowsByFileType<T extends FileEntry & { outlineDepth?: number }>(entries: T[]): Array<FileTypeGroup<T>> {
  const groupedRoots = new Map<string, T[]>();
  let currentRootGroupId = "";
  for (const entry of entries) {
    const depth = entry.outlineDepth ?? 0;
    const groupId = depth > 0 && currentRootGroupId ? currentRootGroupId : extensionGroupName(entry);
    if (depth === 0) currentRootGroupId = groupId;
    groupedRoots.set(groupId, [...(groupedRoots.get(groupId) ?? []), entry]);
  }
  return Array.from(groupedRoots.entries())
    .sort(([a], [b]) => compareGroupIds(a, b))
    .map(([id, groupEntries]) => ({
      id,
      label: groupLabel(id),
      entries: groupEntries
    }));
}
