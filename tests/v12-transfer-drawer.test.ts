import { describe, expect, it } from "vitest";
import { formatTransferTaskMetaLine } from "../src/renderer/v12/v12TransferRowSummary";
import type { TransferTask } from "../src/shared/types/models";

function baseTask(over: Partial<TransferTask> = {}): TransferTask {
  return {
    id: "t1",
    tabId: "tab",
    direction: "upload",
    source: "/a",
    destination: "/b",
    sourceDisplay: "/local/a",
    destinationDisplay: "host:/r/b",
    host: "h",
    port: 22,
    username: "u",
    remotePath: "/r/b",
    localPath: "/local/a",
    status: "running",
    rawLog: [],
    createdAt: 0,
    ...over
  };
}

describe("formatTransferTaskMetaLine", () => {
  it("joins percent, progress, speed, eta when present", () => {
    const s = formatTransferTaskMetaLine(
      baseTask({
        percent: 38.2,
        progressText: "copying",
        speed: "1.2 MB/s",
        eta: "0:12"
      })
    );
    expect(s).toContain("38%");
    expect(s).toContain("copying");
    expect(s).toContain("1.2 MB/s");
    expect(s).toContain("ETA 0:12");
  });

  it("falls back to em dash when empty", () => {
    expect(formatTransferTaskMetaLine(baseTask({ percent: undefined }))).toBe("—");
  });

  it("prefers progressText over currentFile", () => {
    expect(
      formatTransferTaskMetaLine(
        baseTask({
          progressText: "done",
          currentFile: "file.txt"
        })
      )
    ).toBe("done");
  });
});
