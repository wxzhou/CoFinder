import { describe, expect, it } from "vitest";
import { resolveRowTransferDropTarget } from "../src/renderer/transferDropIntent";

describe("resolveRowTransferDropTarget", () => {
  it("uploads local drags dropped on remote files into the current remote folder", () => {
    expect(
      resolveRowTransferDropTarget({
        targetPane: "remote",
        activeTabId: "tab1",
        payload: { pane: "local", tabId: "tab1" },
        hasFinderFiles: false,
        entryType: "file",
        entryPath: "/remote/current/existing.txt",
        currentPath: "/remote/current"
      })
    ).toBe("/remote/current");
  });

  it("downloads remote drags dropped on local files into the current local folder", () => {
    expect(
      resolveRowTransferDropTarget({
        targetPane: "local",
        activeTabId: "tab1",
        payload: { pane: "remote", tabId: "tab1" },
        hasFinderFiles: false,
        entryType: "file",
        entryPath: "/Users/me/current/existing.txt",
        currentPath: "/Users/me/current"
      })
    ).toBe("/Users/me/current");
  });

  it("uses directory rows as the destination for cross-pane drops", () => {
    expect(
      resolveRowTransferDropTarget({
        targetPane: "remote",
        activeTabId: "tab1",
        payload: { pane: "local", tabId: "tab1" },
        hasFinderFiles: false,
        entryType: "directory",
        entryPath: "/remote/current/folder",
        currentPath: "/remote/current"
      })
    ).toBe("/remote/current/folder");
  });

  it("uploads Finder files dropped on remote file rows into the current remote folder", () => {
    expect(
      resolveRowTransferDropTarget({
        targetPane: "remote",
        activeTabId: "tab1",
        payload: null,
        hasFinderFiles: true,
        entryType: "file",
        entryPath: "/remote/current/existing.txt",
        currentPath: "/remote/current"
      })
    ).toBe("/remote/current");
  });

  it("does not turn same-pane remote drags on file rows into transfers", () => {
    expect(
      resolveRowTransferDropTarget({
        targetPane: "remote",
        activeTabId: "tab1",
        payload: { pane: "remote", tabId: "tab1" },
        hasFinderFiles: false,
        entryType: "file",
        entryPath: "/remote/current/existing.txt",
        currentPath: "/remote/current"
      })
    ).toBeNull();
  });
});
