import { describe, expect, it } from "vitest";
import {
  entriesMatchingPaths,
  multiSelectionFileBytes,
  multiSelectionPreviewNames,
  pathInfoKindLabel,
  pathInfoNeedsDirectoryDetails
} from "../src/renderer/v12/v12InspectorSummary";
import { inspectorColumnVisible } from "../src/renderer/v12/v12InspectorVisibility";

describe("inspectorColumnVisible", () => {
  it("hides when nothing selected", () => {
    expect(inspectorColumnVisible("local", 0, true)).toBe(false);
    expect(inspectorColumnVisible("remote", 0, true)).toBe(false);
  });

  it("shows local when selected", () => {
    expect(inspectorColumnVisible("local", 1, true)).toBe(true);
    expect(inspectorColumnVisible("local", 3, false)).toBe(true);
  });

  it("hides remote when disconnected", () => {
    expect(inspectorColumnVisible("remote", 1, false)).toBe(false);
    expect(inspectorColumnVisible("remote", 2, false)).toBe(false);
  });

  it("shows remote when connected and selected", () => {
    expect(inspectorColumnVisible("remote", 1, true)).toBe(true);
  });
});

describe("v12InspectorSummary", () => {
  it("pathInfoKindLabel", () => {
    expect(pathInfoKindLabel("directory")).toBe("Folder");
    expect(pathInfoKindLabel("file")).toBe("Document");
    expect(pathInfoKindLabel("symlink")).toBe("Symbolic link");
    expect(pathInfoKindLabel("unknown")).toBe("Item");
  });

  it("uses path info type as the authoritative signal for directory detail loading", () => {
    expect(pathInfoNeedsDirectoryDetails({ type: "directory" })).toBe(true);
    expect(pathInfoNeedsDirectoryDetails({ type: "file" })).toBe(false);
    expect(pathInfoNeedsDirectoryDetails({ type: "symlink" })).toBe(false);
  });

  it("aggregates file bytes for multi-select", () => {
    const entries = [
      { fullPath: "/a/f1", name: "f1", size: 10, type: "file" },
      { fullPath: "/a/d", name: "d", size: 0, type: "directory" },
      { fullPath: "/a/f2", name: "f2", size: 5, type: "file" }
    ];
    expect(multiSelectionFileBytes(["/a/f1", "/a/d"], entries)).toBe(10);
    expect(multiSelectionFileBytes(["/a/f1", "/a/f2"], entries)).toBe(15);
  });

  it("preview names respect order and max", () => {
    const entries = [
      { fullPath: "/a/1", name: "one" },
      { fullPath: "/a/2", name: "two" },
      { fullPath: "/a/3", name: "three" }
    ];
    expect(multiSelectionPreviewNames(["/a/1", "/a/2"], entries, 4)).toEqual(["one", "two"]);
  });

  it("entriesMatchingPaths", () => {
    const rows = [
      { fullPath: "/x/a", name: "a" },
      { fullPath: "/x/b", name: "b" }
    ];
    expect(entriesMatchingPaths(["/x/b"], rows)).toEqual([{ fullPath: "/x/b", name: "b" }]);
  });
});
