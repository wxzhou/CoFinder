import { describe, expect, it } from "vitest";
import { flattenOutlineRows, hiddenDescendantPaths, isSameOrDescendantPath, pruneOutlinePath, type OutlineState } from "../src/renderer/v12/outlineRows";
import type { FileEntry } from "../src/shared/types/models";

const entry = (fullPath: string, type: FileEntry["type"] = "file"): FileEntry => ({
  name: fullPath.split("/").filter(Boolean).at(-1) ?? "/",
  fullPath,
  type,
  size: 0,
  mtime: "2026-01-01T00:00:00.000Z"
});

const sortAndFilter = (rows: FileEntry[]): FileEntry[] => rows.slice().sort((a, b) => a.name.localeCompare(b.name));

describe("outline rows", () => {
  it("flattens expanded nested folders with depth metadata", () => {
    const roots = [entry("/root/b", "directory"), entry("/root/a.txt")];
    const outline: OutlineState<FileEntry> = {
      "/root/b": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/b/d.txt"), entry("/root/b/c", "directory")]
      },
      "/root/b/c": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/b/c/e.txt")]
      }
    };

    const rows = flattenOutlineRows(roots, outline, { sortAndFilter });

    expect(rows.map((row) => [row.fullPath, row.outlineDepth, row.outlineParentPath ?? ""])).toEqual([
      ["/root/b", 0, ""],
      ["/root/b/c", 1, "/root/b"],
      ["/root/b/c/e.txt", 2, "/root/b/c"],
      ["/root/b/d.txt", 1, "/root/b"],
      ["/root/a.txt", 0, ""]
    ]);
  });

  it("does not include children for collapsed folders", () => {
    const roots = [entry("/root/folder", "directory")];
    const outline: OutlineState<FileEntry> = {
      "/root/folder": {
        expanded: false,
        status: "ready",
        entries: [entry("/root/folder/hidden.txt")]
      }
    };

    expect(flattenOutlineRows(roots, outline, { sortAndFilter }).map((row) => row.fullPath)).toEqual(["/root/folder"]);
  });

  it("shows a loading placeholder for newly expanded folders before children arrive", () => {
    const roots = [entry("/root/folder", "directory")];
    const outline: OutlineState<FileEntry> = {
      "/root/folder": {
        expanded: true,
        status: "loading",
        entries: []
      }
    };

    const rows = flattenOutlineRows(roots, outline, { sortAndFilter });

    expect(rows.map((row) => [row.name, row.outlineDepth, row.outlineParentPath ?? "", row.outlinePlaceholderKind ?? ""])).toEqual([
      ["folder", 0, "", ""],
      ["", 1, "/root/folder", "loading"]
    ]);
  });

  it("shows an empty placeholder for expanded folders that loaded no children", () => {
    const roots = [entry("/root/folder", "directory")];
    const outline: OutlineState<FileEntry> = {
      "/root/folder": {
        expanded: true,
        status: "ready",
        entries: []
      }
    };

    const rows = flattenOutlineRows(roots, outline, { sortAndFilter });

    expect(rows.map((row) => [row.name, row.outlineDepth, row.outlineParentPath ?? "", row.outlinePlaceholderKind ?? ""])).toEqual([
      ["folder", 0, "", ""],
      ["(empty)", 1, "/root/folder", "empty"]
    ]);
  });

  it("keeps cached children visible instead of replacing them with a loading placeholder", () => {
    const roots = [entry("/root/folder", "directory")];
    const outline: OutlineState<FileEntry> = {
      "/root/folder": {
        expanded: true,
        status: "loading",
        entries: [entry("/root/folder/cached.txt")]
      }
    };

    const rows = flattenOutlineRows(roots, outline, { sortAndFilter });

    expect(rows.map((row) => [row.fullPath, row.outlinePlaceholderKind ?? ""])).toEqual([
      ["/root/folder", ""],
      ["/root/folder/cached.txt", ""]
    ]);
  });

  it("collects hidden descendants when a folder collapses", () => {
    const outline: OutlineState<FileEntry> = {
      "/root/folder": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/folder/child", "directory"), entry("/root/folder/a.txt")]
      },
      "/root/folder/child": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/folder/child/deep.txt")]
      }
    };

    expect([...hiddenDescendantPaths("/root/folder", outline)].sort()).toEqual([
      "/root/folder/a.txt",
      "/root/folder/child",
      "/root/folder/child/deep.txt"
    ]);
  });

  it("matches moved paths without matching same-prefix siblings", () => {
    expect(isSameOrDescendantPath("/root/folder", "/root/folder")).toBe(true);
    expect(isSameOrDescendantPath("/root/folder/child.txt", "/root/folder")).toBe(true);
    expect(isSameOrDescendantPath("/root/folder2/child.txt", "/root/folder")).toBe(false);
  });

  it("prunes moved folders from expanded outline caches", () => {
    const outline: OutlineState<FileEntry> = {
      "/root/folder": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/folder/child", "directory"), entry("/root/folder/a.txt")]
      },
      "/root/folder/child": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/folder/child/deep.txt")]
      },
      "/root/folder2": {
        expanded: true,
        status: "ready",
        entries: [entry("/root/folder2/keep.txt")]
      }
    };

    const pruned = pruneOutlinePath(outline, "/root/folder");

    expect(Object.keys(pruned).sort()).toEqual(["/root/folder2"]);
    expect(pruned["/root/folder2"].entries.map((item) => item.fullPath)).toEqual(["/root/folder2/keep.txt"]);
  });
});
