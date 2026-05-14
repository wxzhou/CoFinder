import { describe, expect, it } from "vitest";
import { formatTransferTaskMetaLine } from "../src/renderer/v12/v12TransferRowSummary";
import type { TransferTask } from "../src/shared/types/models";

const baseTask: TransferTask = {
  id: "t1",
  tabId: "tab-1",
  direction: "upload",
  status: "running",
  source: "/local/file.txt",
  destination: "/remote/file.txt",
  createdAt: 1,
  updatedAt: 2,
  rawLog: []
};

describe("formatTransferTaskMetaLine", () => {
  it("prioritizes stable failure code and message for failed tasks", () => {
    expect(
      formatTransferTaskMetaLine({
        ...baseTask,
        status: "failed",
        errorCode: "PERMISSION_DENIED",
        error: "Cannot write destination",
        percent: 50,
        progressText: "ignored"
      })
    ).toBe("PERMISSION_DENIED · Cannot write destination");
  });

  it("formats progress, current file, speed, and eta", () => {
    expect(
      formatTransferTaskMetaLine({
        ...baseTask,
        percent: 41.6,
        currentFile: "file.txt",
        speed: "1.2 MB/s",
        eta: "00:03"
      })
    ).toBe("42% · file.txt · 1.2 MB/s · ETA 00:03");
  });

  it("uses progress text before current file and falls back to a dash", () => {
    expect(formatTransferTaskMetaLine({ ...baseTask, progressText: "checking" })).toBe("checking");
    expect(formatTransferTaskMetaLine(baseTask)).toBe("—");
  });
});
