import { describe, expect, it } from "vitest";
import { classifyFileIcon } from "../src/renderer/v12/fileIconClassifier";

describe("classifyFileIcon", () => {
  it("keeps folders and symlinks distinct from extension-based files", () => {
    expect(classifyFileIcon({ name: "src", type: "directory" }).kind).toBe("folder");
    expect(classifyFileIcon({ name: "shortcut", type: "symlink" }).kind).toBe("symlink");
  });

  it("classifies common file extensions case-insensitively", () => {
    expect(classifyFileIcon({ name: "script.PY", type: "file" }).kind).toBe("code");
    expect(classifyFileIcon({ name: "figure.jpeg", type: "file" }).kind).toBe("image");
    expect(classifyFileIcon({ name: "paper.pdf", type: "file" }).kind).toBe("pdf");
    expect(classifyFileIcon({ name: "table.csv", type: "file" }).kind).toBe("data");
    expect(classifyFileIcon({ name: "archive.tar.gz", type: "file" }).kind).toBe("archive");
  });

  it("uses Other for extensionless files", () => {
    expect(classifyFileIcon({ name: "README", type: "file" })).toMatchObject({ kind: "other", label: "OTHER" });
  });
});

