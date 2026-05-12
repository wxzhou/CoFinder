import { describe, expect, it } from "vitest";
import { addRecentPath, buildPathSuggestions, filterEntriesByName } from "../src/renderer/navigationEfficiency";

describe("navigation efficiency helpers", () => {
  it("filters entries by deterministic case-insensitive substring", () => {
    const entries = [
      { name: "Archive", fullPath: "/Archive", type: "directory" as const, size: 0, mtime: "" },
      { name: "notes.txt", fullPath: "/notes.txt", type: "file" as const, size: 1, mtime: "" },
      { name: "photo.png", fullPath: "/photo.png", type: "file" as const, size: 1, mtime: "" }
    ];

    expect(filterEntriesByName(entries, "o").map((e) => e.name)).toEqual(["notes.txt", "photo.png"]);
    expect(filterEntriesByName(entries, "  ARCH ").map((e) => e.name)).toEqual(["Archive"]);
  });

  it("keeps recent paths deduped and newest first", () => {
    const first = addRecentPath([], "/tmp/a", 1);
    const second = addRecentPath(first, "/tmp/b", 2);
    const third = addRecentPath(second, "/tmp/a/", 3);

    expect(third.map((r) => r.path)).toEqual(["/tmp/a", "/tmp/b"]);
    expect(third[0].visitedAt).toBe(3);
  });

  it("builds prefix suggestions without duplicates", () => {
    const suggestions = buildPathSuggestions("/Users/z", ["/Users/zwx", "/Users/zwx/", "/Users/other", "/tmp"]);
    expect(suggestions).toEqual(["/Users/zwx"]);
  });
});
