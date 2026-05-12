import { describe, expect, it } from "vitest";
import { formatDiagnosticsBundle } from "../src/main/services/DiagnosticsService";
import type { DiagnosticsBundle } from "../src/shared/types/ipc";

describe("formatDiagnosticsBundle", () => {
  it("formats release diagnostics without leaking common secret patterns", () => {
    const bundle: DiagnosticsBundle = {
      generatedAt: "2026-05-12T00:00:00.000Z",
      appVersion: "0.10.0",
      platform: "darwin",
      arch: "arm64",
      userDataPath: "/Users/example/Library/Application Support/CoFinder",
      logFilePath: "/tmp/main.log",
      logFileExists: true,
      tools: {
        ssh: { available: true, detail: "OpenSSH_9.9 password=hunter2" },
        rsync: { available: false, detail: '{"token":"abc123"}' }
      },
      updatePolicy: {
        mode: "manual-github-release",
        status: "manual check only"
      }
    };

    const text = formatDiagnosticsBundle(bundle);
    expect(text).toContain("CoFinder Diagnostics");
    expect(text).toContain("appVersion: 0.10.0");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("abc123");
    expect(text).toContain("<redacted>");
  });
});
