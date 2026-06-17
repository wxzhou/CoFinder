import type { FileEntry } from "../../shared/types/models";

export type OutlineNode<T extends FileEntry> = {
  expanded: boolean;
  status: "idle" | "loading" | "ready" | "error";
  entries: T[];
  error?: string;
};

export type OutlinePlaceholderKind = "loading" | "empty";

export type OutlineRow<T extends FileEntry> = T & {
  outlineDepth: number;
  outlineParentPath?: string;
  outlinePlaceholderKind?: OutlinePlaceholderKind;
};

export type OutlineState<T extends FileEntry> = Record<string, OutlineNode<T>>;

export function isOutlinePlaceholder<T extends FileEntry>(entry: FileEntry): entry is OutlineRow<T> & { outlinePlaceholderKind: OutlinePlaceholderKind } {
  return Boolean((entry as { outlinePlaceholderKind?: OutlinePlaceholderKind }).outlinePlaceholderKind);
}

function makeOutlinePlaceholder<T extends FileEntry>(
  parent: T,
  kind: OutlinePlaceholderKind,
  depth: number
): OutlineRow<T> {
  return {
    name: kind === "empty" ? "(empty)" : "",
    fullPath: `cofinder:outline:${kind}:${parent.fullPath}`,
    type: "unknown",
    size: 0,
    mtime: parent.mtime,
    outlineDepth: depth,
    outlineParentPath: parent.fullPath,
    outlinePlaceholderKind: kind
  } as OutlineRow<T>;
}

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
      if (node.entries.length === 0) {
        if (node.status === "loading" || node.status === "ready") {
          output.push(makeOutlinePlaceholder(entry, node.status === "loading" ? "loading" : "empty", depth + 1));
        }
      } else {
        visit(options.sortAndFilter(node.entries), depth + 1, entry.fullPath);
      }
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

export function isSameOrDescendantPath(candidatePath: string, parentPath: string): boolean {
  const normalizedParent = parentPath.replace(/\/+$/, "") || "/";
  const normalizedCandidate = candidatePath.replace(/\/+$/, "") || "/";
  if (normalizedParent === "/") return normalizedCandidate.startsWith("/");
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

export function pruneOutlinePath<T extends FileEntry>(outline: OutlineState<T>, removedPath: string): OutlineState<T> {
  let changed = false;
  const nextOutline: OutlineState<T> = {};
  for (const [path, node] of Object.entries(outline)) {
    if (isSameOrDescendantPath(path, removedPath)) {
      changed = true;
      continue;
    }
    const entries = node.entries.filter((entry) => !isSameOrDescendantPath(entry.fullPath, removedPath));
    if (entries.length !== node.entries.length) changed = true;
    nextOutline[path] = entries.length === node.entries.length ? node : { ...node, entries };
  }
  return changed ? nextOutline : outline;
}
