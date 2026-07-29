import { describe, expect, it } from "vitest";
import { isSourceLikePath } from "../src/shared/sourceFileTypes";

describe("source-file opener routing", () => {
  it("leaves HTML files to the system default application", () => {
    expect(isSourceLikePath("/remote/report.html")).toBe(false);
    expect(isSourceLikePath("/remote/report.HTM")).toBe(false);
  });

  it("continues to route source and script files to the text editor", () => {
    expect(isSourceLikePath("/remote/run.sh")).toBe(true);
    expect(isSourceLikePath("/remote/analysis.PY")).toBe(true);
  });
});
