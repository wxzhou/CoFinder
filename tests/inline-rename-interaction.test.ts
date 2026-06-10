import { describe, expect, it } from "vitest";
import { shouldCommitInlineRenameFromPaneBackground } from "../src/renderer/inlineRenameInteraction";

describe("shouldCommitInlineRenameFromPaneBackground", () => {
  it("commits inline rename when the pane background is clicked", () => {
    expect(
      shouldCommitInlineRenameFromPaneBackground({
        hasInlineRename: true,
        mouseButton: 0,
        targetIsInteractive: false
      })
    ).toBe(true);
  });

  it("ignores non-left clicks and interactive targets", () => {
    expect(
      shouldCommitInlineRenameFromPaneBackground({
        hasInlineRename: true,
        mouseButton: 2,
        targetIsInteractive: false
      })
    ).toBe(false);
    expect(
      shouldCommitInlineRenameFromPaneBackground({
        hasInlineRename: true,
        mouseButton: 0,
        targetIsInteractive: true
      })
    ).toBe(false);
  });

  it("does nothing when no inline rename is active", () => {
    expect(
      shouldCommitInlineRenameFromPaneBackground({
        hasInlineRename: false,
        mouseButton: 0,
        targetIsInteractive: false
      })
    ).toBe(false);
  });
});
