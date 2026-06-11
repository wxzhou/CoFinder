import { describe, expect, it } from "vitest";
import {
  buildBatchRenamePreview,
  validateBatchRenamePlan,
  type BatchRenameEntry,
  type BatchRenamePreviewItem
} from "../src/renderer/batchRenameModel";

const entries: BatchRenameEntry[] = [
  { fullPath: "/tmp/alpha.txt", name: "alpha.txt" },
  { fullPath: "/tmp/beta.txt", name: "beta.txt" },
  { fullPath: "/tmp/archive.tar.gz", name: "archive.tar.gz" }
];

describe("batchRenameModel", () => {
  it("replaces text while preserving file extensions by default", () => {
    const preview = buildBatchRenamePreview(entries, {
      mode: "replace",
      applyToExtension: false,
      findText: "a",
      replaceText: "o",
      addText: "",
      addPosition: "after",
      formatBaseName: "",
      formatStartNumber: 1,
      formatPadding: 2
    });

    expect(preview.map((item) => item.newName)).toEqual(["olpho.txt", "beto.txt", "orchive.tar.gz"]);
  });

  it("adds text before or after the protected base name", () => {
    const before = buildBatchRenamePreview([entries[0]], {
      mode: "add",
      applyToExtension: false,
      findText: "",
      replaceText: "",
      addText: "draft-",
      addPosition: "before",
      formatBaseName: "",
      formatStartNumber: 1,
      formatPadding: 2
    });
    const after = buildBatchRenamePreview([entries[0]], {
      mode: "add",
      applyToExtension: false,
      findText: "",
      replaceText: "",
      addText: "-final",
      addPosition: "after",
      formatBaseName: "",
      formatStartNumber: 1,
      formatPadding: 2
    });

    expect(before[0].newName).toBe("draft-alpha.txt");
    expect(after[0].newName).toBe("alpha-final.txt");
  });

  it("formats selected entries in order with padded numbers", () => {
    const preview = buildBatchRenamePreview(entries.slice(0, 2), {
      mode: "format",
      applyToExtension: false,
      findText: "",
      replaceText: "",
      addText: "",
      addPosition: "after",
      formatBaseName: "sample",
      formatStartNumber: 7,
      formatPadding: 3
    });

    expect(preview.map((item) => item.newName)).toEqual(["sample-007.txt", "sample-008.txt"]);
  });

  it("reports duplicate output names and visible folder collisions", () => {
    const duplicatePlan: BatchRenamePreviewItem[] = [
      { fullPath: "/tmp/a.txt", originalName: "a.txt", newName: "same.txt", changed: true },
      { fullPath: "/tmp/b.txt", originalName: "b.txt", newName: "same.txt", changed: true }
    ];

    expect(validateBatchRenamePlan(duplicatePlan, [])).toContain("Duplicate new name: same.txt.");

    const collisionPlan = buildBatchRenamePreview([entries[0]], {
      mode: "replace",
      applyToExtension: false,
      findText: "alpha",
      replaceText: "existing",
      addText: "",
      addPosition: "after",
      formatBaseName: "",
      formatStartNumber: 1,
      formatPadding: 2
    });

    expect(validateBatchRenamePlan(collisionPlan, [{ fullPath: "/tmp/existing.txt", name: "existing.txt" }])).toContain(
      "Name already exists in this folder: existing.txt."
    );
  });

  it("rejects empty names and path separators", () => {
    const emptyPlan = buildBatchRenamePreview([entries[0]], {
      mode: "replace",
      applyToExtension: true,
      findText: "alpha.txt",
      replaceText: "",
      addText: "",
      addPosition: "after",
      formatBaseName: "",
      formatStartNumber: 1,
      formatPadding: 2
    });
    const badPlan = buildBatchRenamePreview([entries[0]], {
      mode: "replace",
      applyToExtension: false,
      findText: "alpha",
      replaceText: "bad/name",
      addText: "",
      addPosition: "after",
      formatBaseName: "",
      formatStartNumber: 1,
      formatPadding: 2
    });

    expect(validateBatchRenamePlan(emptyPlan, [])).toContain("New names cannot be empty.");
    expect(validateBatchRenamePlan(badPlan, [])).toContain("New names cannot contain path separators or control characters.");
  });
});
