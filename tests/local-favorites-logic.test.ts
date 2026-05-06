import { describe, expect, it } from "vitest";
import {
  buildDefaultFavorites,
  isDefaultFavoriteId,
  isDuplicateFavoritePath,
  labelForLocalPath,
  mergeResolvedFavorites,
  normalizeLocalPath,
  parseFavoritesFile,
  pathsAreSameFavorite,
  pickActiveFavoriteId,
  sanitizeCustomDiskEntry
} from "../src/shared/localFavorites";

describe("normalizeLocalPath", () => {
  it("collapses slashes and trims trailing slash except root", () => {
    expect(normalizeLocalPath("/a//b/c/")).toBe("/a/b/c");
    expect(normalizeLocalPath("/")).toBe("/");
    expect(normalizeLocalPath("")).toBe("/");
  });
});

describe("pathsAreSameFavorite", () => {
  it("treats trailing slash variants as equal", () => {
    expect(pathsAreSameFavorite("/Users/x/Desktop", "/Users/x/Desktop/")).toBe(true);
  });
});

describe("pickActiveFavoriteId", () => {
  it("returns null when nothing matches", () => {
    expect(pickActiveFavoriteId("/tmp/z", [{ id: "a", path: "/other" }])).toBeNull();
  });

  it("uses exact match", () => {
    const favs = [
      { id: "home", path: "/Users/me" },
      { id: "desk", path: "/Users/me/Desktop" }
    ];
    expect(pickActiveFavoriteId("/Users/me/Desktop", favs)).toBe("desk");
  });

  it("prefers longest prefix", () => {
    const favs = [
      { id: "home", path: "/Users/me" },
      { id: "proj", path: "/Users/me/Projects" }
    ];
    expect(pickActiveFavoriteId("/Users/me/Projects/app", favs)).toBe("proj");
  });

  it("treats root as shallow prefix", () => {
    const favs = [
      { id: "root", path: "/" },
      { id: "usr", path: "/usr" }
    ];
    expect(pickActiveFavoriteId("/usr/local", favs)).toBe("usr");
  });
});

describe("isDuplicateFavoritePath", () => {
  it("detects normalized duplicates", () => {
    const list = [{ path: "/a/b" }];
    expect(isDuplicateFavoritePath("/a/b/", list)).toBe(true);
    expect(isDuplicateFavoritePath("/a/c", list)).toBe(false);
  });
});

describe("buildDefaultFavorites + merge", () => {
  it("orders defaults then sorted custom by createdAt", () => {
    const wk = { home: "/h", desktop: "/h/Desktop", downloads: "/h/Downloads", documents: "/h/Documents" };
    const defaults = buildDefaultFavorites(wk);
    expect(defaults.map((d) => d.id)).toEqual(["home", "desktop", "downloads", "documents"]);
    const merged = mergeResolvedFavorites(wk, [
      { id: "c2", label: "Second", path: "/z2", createdAt: 2 },
      { id: "c1", label: "First", path: "/z1", createdAt: 1 }
    ]);
    expect(merged.slice(0, 4).every((r) => r.isDefault)).toBe(true);
    expect(merged[4].id).toBe("c1");
    expect(merged[5].id).toBe("c2");
  });

  it("omits hidden default ids", () => {
    const wk = { home: "/h", desktop: "/h/Desktop", downloads: "/h/Downloads", documents: "/h/Documents" };
    const merged = mergeResolvedFavorites(wk, [], ["home", "downloads"]);
    expect(merged.map((r) => r.id)).toEqual(["desktop", "documents"]);
    expect(merged.every((r) => r.isDefault)).toBe(true);
  });
});

describe("labelForLocalPath", () => {
  it("uses basename and Macintosh HD for root", () => {
    expect(labelForLocalPath("/Users/me/Projects")).toBe("Projects");
    expect(labelForLocalPath("/")).toBe("Macintosh HD");
  });
});

describe("sanitizeCustomDiskEntry", () => {
  it("rejects default ids", () => {
    expect(sanitizeCustomDiskEntry({ id: "home", label: "X", path: "/x", createdAt: 1 })).toBeNull();
  });

  it("accepts valid custom", () => {
    const row = sanitizeCustomDiskEntry({ id: "uuid-1", label: "Mine", path: "/tmp/a", createdAt: 5 });
    expect(row?.id).toBe("uuid-1");
  });
});

describe("parseFavoritesFile", () => {
  it("parses v1 file", () => {
    const raw = JSON.stringify({
      version: 1,
      custom: [{ id: "u1", label: "L", path: "/p", createdAt: 1 }]
    });
    const d = parseFavoritesFile(raw);
    expect(d.custom).toHaveLength(1);
    expect(d.custom[0].id).toBe("u1");
    expect(d.hiddenDefaultIds).toBeUndefined();
  });

  it("parses hiddenDefaultIds", () => {
    const raw = JSON.stringify({
      version: 1,
      custom: [],
      hiddenDefaultIds: ["home", "bogus", "desktop"]
    });
    const d = parseFavoritesFile(raw);
    expect(d.hiddenDefaultIds?.sort()).toEqual(["desktop", "home"]);
  });

  it("throws on bad version", () => {
    expect(() => parseFavoritesFile(JSON.stringify({ version: 2, custom: [] }))).toThrow();
  });
});

describe("isDefaultFavoriteId", () => {
  it("recognizes built-in ids", () => {
    expect(isDefaultFavoriteId("desktop")).toBe(true);
    expect(isDefaultFavoriteId("nope")).toBe(false);
  });
});
