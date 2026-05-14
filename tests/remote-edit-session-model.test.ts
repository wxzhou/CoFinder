import { describe, expect, it } from "vitest";
import {
  remoteEditRemoteChanged,
  remoteEditSessionKey,
  transitionRemoteEditSession,
  type RemoteEditSession
} from "../src/main/services/RemoteEditSessionModel";

describe("remote edit session model", () => {
  it("keys sessions by tab, connection, and remote path", () => {
    expect(remoteEditSessionKey("tab", "conn", "/a.txt")).not.toBe(remoteEditSessionKey("tab", "conn", "/b.txt"));
    expect(remoteEditSessionKey("tab", "conn", "/a.txt")).not.toBe(remoteEditSessionKey("tab2", "conn", "/a.txt"));
  });

  it("detects remote metadata changes against the session baseline", () => {
    expect(remoteEditRemoteChanged({ size: 10, modifyTime: 100 }, { size: 10, modifyTime: 100 })).toBe(false);
    expect(remoteEditRemoteChanged({ size: 10, modifyTime: 100 }, { size: 11, modifyTime: 100 })).toBe(true);
    expect(remoteEditRemoteChanged({ size: 10, modifyTime: 100 }, { size: 10, modifyTime: 101 })).toBe(true);
  });

  it("transitions state without discarding identity fields", () => {
    const base: RemoteEditSession = {
      id: "s1",
      tabId: "tab",
      connectionId: "conn",
      remotePath: "/a.txt",
      localPath: "/tmp/a.txt",
      baseline: { size: 1, modifyTime: 2 },
      lastLocalSize: 1,
      lastLocalMtimeMs: 3,
      state: "clean",
      error: "",
      updatedAt: 10
    };

    expect(transitionRemoteEditSession(base, { state: "conflict", error: "changed" }, 20)).toMatchObject({
      id: "s1",
      remotePath: "/a.txt",
      state: "conflict",
      error: "changed",
      updatedAt: 20
    });
  });
});
