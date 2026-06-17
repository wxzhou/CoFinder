import { describe, expect, it } from "vitest";
import {
  applyKeyboardRowSelection,
  applyMarqueeSelection,
  applyRowSelection,
  clearSelectionState,
  normalizeContextSelection,
  normalizeDragRect,
  rectsIntersect,
  selectAllRows,
  stringifySelection
} from "../src/renderer/selection";

const rows = [
  { fullPath: "/a", name: "a" },
  { fullPath: "/b", name: "b" },
  { fullPath: "/c", name: "c" },
  { fullPath: "/d", name: "d" }
];

describe("selection helpers", () => {
  it("single click replaces selection", () => {
    const next = applyRowSelection(rows, { selectedFullPaths: ["/a"], selectionAnchorFullPath: "/a" }, "/c", {
      metaKey: false,
      shiftKey: false
    });
    expect(next.selectedFullPaths).toEqual(["/c"]);
    expect(next.selectionAnchorFullPath).toBe("/c");
  });

  it("cmd-click toggles selection", () => {
    const add = applyRowSelection(rows, { selectedFullPaths: ["/a"], selectionAnchorFullPath: "/a" }, "/c", {
      metaKey: true,
      shiftKey: false
    });
    expect(add.selectedFullPaths).toEqual(["/a", "/c"]);

    const remove = applyRowSelection(rows, add, "/a", { metaKey: true, shiftKey: false });
    expect(remove.selectedFullPaths).toEqual(["/c"]);
  });

  it("shift-click selects range from anchor", () => {
    const next = applyRowSelection(rows, { selectedFullPaths: ["/b"], selectionAnchorFullPath: "/b" }, "/d", {
      metaKey: false,
      shiftKey: true
    });
    expect(next.selectedFullPaths).toEqual(["/b", "/c", "/d"]);
  });

  it("shift-click follows caller-provided visible row order", () => {
    const visibleRows = [rows[3]!, rows[1]!, rows[2]!, rows[0]!];
    const next = applyRowSelection(visibleRows, { selectedFullPaths: ["/d"], selectionAnchorFullPath: "/d" }, "/c", {
      metaKey: false,
      shiftKey: true
    });
    expect(next.selectedFullPaths).toEqual(["/d", "/b", "/c"]);
  });

  it("shift-click replaces previous non-range selections", () => {
    const next = applyRowSelection(rows, { selectedFullPaths: ["/a", "/d"], selectionAnchorFullPath: "/b" }, "/c", {
      metaKey: false,
      shiftKey: true
    });
    expect(next.selectedFullPaths).toEqual(["/b", "/c"]);
  });

  it("arrow keys move selection through visible rows", () => {
    const down = applyKeyboardRowSelection(rows, { selectedFullPaths: ["/b"], selectionAnchorFullPath: "/b" }, 1, {
      extend: false
    });
    expect(down).toEqual({ selectedFullPaths: ["/c"], selectionAnchorFullPath: "/c" });

    const upFromEmpty = applyKeyboardRowSelection(rows, clearSelectionState(), -1, { extend: false });
    expect(upFromEmpty).toEqual({ selectedFullPaths: ["/d"], selectionAnchorFullPath: "/d" });
  });

  it("shift-arrow extends and shrinks a range from the anchor", () => {
    const extended = applyKeyboardRowSelection(rows, { selectedFullPaths: ["/b"], selectionAnchorFullPath: "/b" }, 1, {
      extend: true
    });
    expect(extended.selectedFullPaths).toEqual(["/b", "/c"]);
    expect(extended.selectionAnchorFullPath).toBe("/b");

    const shrunk = applyKeyboardRowSelection(rows, extended, -1, { extend: true });
    expect(shrunk.selectedFullPaths).toEqual(["/b"]);
    expect(shrunk.selectionAnchorFullPath).toBe("/b");
  });

  it("keyboard range selection follows caller-provided visible row order", () => {
    const visibleRows = [rows[3]!, rows[1]!, rows[2]!, rows[0]!];
    const next = applyKeyboardRowSelection(visibleRows, { selectedFullPaths: ["/b"], selectionAnchorFullPath: "/b" }, 1, {
      extend: true
    });
    expect(next.selectedFullPaths).toEqual(["/b", "/c"]);
  });

  it("context menu click selects only clicked item when outside selection", () => {
    expect(normalizeContextSelection(["/a", "/b"], "/c")).toEqual(["/c"]);
    expect(normalizeContextSelection(["/a", "/b"], "/a")).toEqual(["/a", "/b"]);
  });

  it("clearSelectionState clears both selection and anchor", () => {
    expect(clearSelectionState()).toEqual({
      selectedFullPaths: [],
      selectionAnchorFullPath: null
    });
  });

  it("stringifies names and paths for copy action", () => {
    expect(stringifySelection(["/a", "/c"], rows, "name")).toBe("a\nc");
    expect(stringifySelection(["/a", "/c"], rows, "path")).toBe("/a\n/c");
  });

  it("stringifies copy selections in visible row order", () => {
    const visibleRows = [rows[3]!, rows[1]!, rows[2]!, rows[0]!];
    expect(stringifySelection(["/a", "/d", "/b"], visibleRows, "name")).toBe("d\nb\na");
    expect(stringifySelection(["/a", "/d", "/b"], visibleRows, "path")).toBe("/d\n/b\n/a");
  });

  it("selectAllRows selects all and sets anchor", () => {
    const state = selectAllRows(rows, "first");
    expect(state.selectedFullPaths).toEqual(["/a", "/b", "/c", "/d"]);
    expect(state.selectionAnchorFullPath).toBe("/a");

    const stateLast = selectAllRows(rows, "last");
    expect(stateLast.selectionAnchorFullPath).toBe("/d");
  });

  it("skips outline placeholder rows during selection and copy helpers", () => {
    const visibleRows = [
      rows[0]!,
      { fullPath: "cofinder:outline:loading:/a", name: "", outlinePlaceholderKind: "loading" },
      rows[1]!
    ];

    expect(selectAllRows(visibleRows).selectedFullPaths).toEqual(["/a", "/b"]);
    expect(applyKeyboardRowSelection(visibleRows, { selectedFullPaths: ["/a"], selectionAnchorFullPath: "/a" }, 1, { extend: false })).toEqual({
      selectedFullPaths: ["/b"],
      selectionAnchorFullPath: "/b"
    });
    expect(stringifySelection(["/a", "cofinder:outline:loading:/a", "/b"], visibleRows, "name")).toBe("a\nb");
  });

  it("normalizes drag rectangle regardless of direction", () => {
    expect(normalizeDragRect(10, 40, 30, 20)).toEqual({ left: 10, top: 20, right: 30, bottom: 40 });
  });

  it("detects rectangle intersection for marquee hit testing", () => {
    expect(rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 10, right: 20, bottom: 20 })).toBe(true);
    expect(rectsIntersect({ left: 0, top: 0, right: 9, bottom: 9 }, { left: 10, top: 10, right: 20, bottom: 20 })).toBe(false);
  });

  it("applies marquee selection with replace and additive modes", () => {
    const rectRows = rows.map((row, index) => ({ ...row, left: 0, right: 100, top: index * 20, bottom: index * 20 + 18 }));
    const marquee = { left: 0, right: 20, top: 19, bottom: 45 };

    const replaced = applyMarqueeSelection(rectRows, marquee, { selectedFullPaths: ["/a"], selectionAnchorFullPath: "/a" }, { additive: false });
    expect(replaced.selectedFullPaths).toEqual(["/b", "/c"]);
    expect(replaced.selectionAnchorFullPath).toBe("/c");

    const additive = applyMarqueeSelection(rectRows, marquee, { selectedFullPaths: ["/a"], selectionAnchorFullPath: "/a" }, { additive: true });
    expect(additive.selectedFullPaths).toEqual(["/a", "/b", "/c"]);
  });
});
