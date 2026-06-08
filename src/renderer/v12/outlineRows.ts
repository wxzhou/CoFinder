import type { FileEntry } from "../../shared/types/models";

export type OutlineNode<T extends FileEntry> = {
  expanded: boolean;
  status: "idle" | "loading" | "ready" | "error";
  entries: T[];
  error?: string;
};

export type OutlineRow<T extends FileEntry> = T & {
  outlineDepth: number;
  outlineParentPath?: string;
};

export type OutlineState<T extends FileEntry> = Record<string, OutlineNode<T>>;

export function flattenOutlineRows<T extends FileEntry>(
  entries: T[],
  outline: OutlineState<T>,
  options: {
    sortAndFilter: (entries: T[]) => T[];
    maxDepth?: number;
  }
): OutlineRow<T>[] {
  const maxDepth = options.maxDepth ?? 8;
  const output: OutlineRow<T>[] = [];
  const seen = new Set<string>();

  const visit = (rows: T[], depth: number, parentPath?: string): void => {
    for (const entry of rows) {
      output.push({ ...entry, outlineDepth: depth, outlineParentPath: parentPath });
      if (entry.type !== "directory" || depth >= maxDepth || seen.has(entry.fullPath)) continue;
      const node = outline[entry.fullPath];
      if (!node?.expanded) continue;
      seen.add(entry.fullPath);
      visit(options.sortAndFilter(node.entries), depth + 1, entry.fullPath);
      seen.delete(entry.fullPath);
    }
  };

  visit(entries, 0);
  return output;
}

export function hiddenDescendantPaths<T extends FileEntry>(parentPath: string, outline: OutlineState<T>): Set<string> {
  const hidden = new Set<string>();
  const visit = (path: string): void => {
    const node = outline[path];
    if (!node) return;
    for (const child of node.entries) {
      hidden.add(child.fullPath);
      if (child.type === "directory") visit(child.fullPath);
    }
  };
  visit(parentPath);
  return hidden;
}

