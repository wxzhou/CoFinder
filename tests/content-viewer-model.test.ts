import { describe, expect, it } from "vitest";
import {
  applyContentOpenRequest,
  highlightTextLine,
  lineWindowStart,
  requestFromSearchResult
} from "../src/renderer/contentViewerModel";

describe("content viewer model", () => {
  it("opens text requests as reusable tabs keyed by pane and path", () => {
    const first = applyContentOpenRequest([], null, {
      kind: "text",
      pane: "remote",
      connectionId: "c1",
      path: "/remote/a.txt",
      initialLine: 2
    });
    const second = applyContentOpenRequest(first.tabs, first.activeTabId, {
      kind: "text",
      pane: "remote",
      connectionId: "c1",
      path: "/remote/a.txt",
      initialLine: 12,
      highlightQuery: "needle"
    });

    expect(second.tabs).toHaveLength(1);
    expect(second.activeTabId).toBe(first.activeTabId);
    expect(second.tabs[0]).toMatchObject({ initialLine: 12, highlightQuery: "needle" });
  });

  it("converts search result view actions into highlighted text requests", () => {
    const request = requestFromSearchResult({
      pane: "local",
      path: "/tmp/report.txt",
      line: 24,
      query: "alpha"
    });

    expect(request).toEqual({
      kind: "text",
      pane: "local",
      path: "/tmp/report.txt",
      connectionId: undefined,
      initialLine: 24,
      highlightQuery: "alpha"
    });
  });

  it("computes a bounded line window around a target line", () => {
    expect(lineWindowStart(40, 8)).toBe(32);
    expect(lineWindowStart(3, 8)).toBe(1);
    expect(lineWindowStart(undefined, 8)).toBe(1);
  });

  it("splits case-insensitive highlighted text matches", () => {
    expect(highlightTextLine("Alpha beta alpha", "alpha")).toEqual([
      { text: "Alpha", match: true },
      { text: " beta ", match: false },
      { text: "alpha", match: true }
    ]);
  });
});

