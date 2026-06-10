import { describe, expect, it } from "vitest";
import { flattenFileTypeGroups, groupEntriesByFileType, groupOutlineRowsByFileType } from "../src/renderer/v12/fileTypeGroups";
import type { FileEntry } from "../src/shared/types/models";

function entry(name: string, type: FileEntry["type"] = "file"): FileEntry {
  return {
    name,
    fullPath: `/tmp/${name}`,
    size: 1,
    mtime: "2026-06-11T00:00:00.000Z",
    type
  };
}

describe("file type groups", () => {
  it("groups directories first, extensions case-insensitively, and extensionless files as Other", () => {
    const groups = groupEntriesByFileType([
      entry("notes.txt"),
      entry("Images", "directory"),
      entry("README"),
      entry(".bashrc"),
      entry("plot.PNG"),
      entry("script.TXT"),
      entry("photo.jpeg"),
      entry("photo.jpg"),
      entry("archive.tar.gz")
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Folders", "GZ", "JPEG", "JPG", "PNG", "TXT", "Other"]);
    expect(groups.find((group) => group.label === "Folders")?.entries.map((item) => item.name)).toEqual(["Images"]);
    expect(groups.find((group) => group.label === "TXT")?.entries.map((item) => item.name)).toEqual(["notes.txt", "script.TXT"]);
    expect(groups.find((group) => group.label === "Other")?.entries.map((item) => item.name)).toEqual(["README", ".bashrc"]);
  });

  it("preserves entry order inside each group and can flatten visible group order", () => {
    const original = [entry("z.R"), entry("a.py"), entry("b.PY"), entry("alpha", "directory"), entry("a.R")];

    expect(flattenFileTypeGroups(original).map((item) => item.name)).toEqual(["alpha", "a.py", "b.PY", "z.R", "a.R"]);
  });

  it("keeps expanded outline children with their root folder group", () => {
    const rows = [
      { ...entry("plain.txt"), outlineDepth: 0 },
      { ...entry("Folder", "directory"), outlineDepth: 0 },
      { ...entry("child.py"), fullPath: "/tmp/Folder/child.py", outlineDepth: 1 },
      { ...entry("script.py"), outlineDepth: 0 }
    ];

    const groups = groupOutlineRowsByFileType(rows);

    expect(groups.map((group) => group.label)).toEqual(["Folders", "PY", "TXT"]);
    expect(groups[0].entries.map((item) => item.name)).toEqual(["Folder", "child.py"]);
  });
});
