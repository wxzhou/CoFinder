import { describe, expect, it } from "vitest";
import { getRendererUiMode } from "../src/renderer/uiMode";

describe("getRendererUiMode", () => {
  it("defaults to shell-v12 when no legacy params (dev)", () => {
    expect(getRendererUiMode({ search: "", isDev: true })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "?foo=1", isDev: true })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "?ui=other", isDev: true })).toBe("shell-v12");
  });

  it("defaults to shell-v12 when no legacy params (non-dev, packaged)", () => {
    expect(getRendererUiMode({ search: "", isDev: false })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "?foo=1", isDev: false })).toBe("shell-v12");
  });

  it("returns v11 for ui=v11 or legacy=1", () => {
    expect(getRendererUiMode({ search: "?ui=v11", isDev: true })).toBe("v11");
    expect(getRendererUiMode({ search: "?legacy=1", isDev: true })).toBe("v11");
    expect(getRendererUiMode({ search: "?ui=v11", isDev: false })).toBe("v11");
  });

  it("returns v11 when viteLegacyUi is true (build-time classic)", () => {
    expect(getRendererUiMode({ search: "", isDev: true, viteLegacyUi: true })).toBe("v11");
    expect(getRendererUiMode({ search: "?foo=1", isDev: false, viteLegacyUi: true })).toBe("v11");
  });

  it("query legacy wins over viteLegacyUi=false semantics via explicit ui=v11", () => {
    expect(getRendererUiMode({ search: "?ui=v11", isDev: true, viteLegacyUi: false })).toBe("v11");
  });

  it("returns shell-v12 when ui=v12 (explicit alias for default)", () => {
    expect(getRendererUiMode({ search: "?ui=v12", isDev: true })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "?ui=v12", isDev: false })).toBe("shell-v12");
  });

  it("accepts search with or without leading ?", () => {
    expect(getRendererUiMode({ search: "ui=v12", isDev: true })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "ui=v11", isDev: true })).toBe("v11");
  });

  it("mockup=v12 wins in dev over ui flags", () => {
    expect(getRendererUiMode({ search: "?ui=v12&mockup=v12", isDev: true })).toBe("mockup-v12");
    expect(getRendererUiMode({ search: "?mockup=v12&ui=v11", isDev: true })).toBe("mockup-v12");
  });

  it("mockup=v12 does not apply when not dev (production ignores mockup)", () => {
    expect(getRendererUiMode({ search: "?mockup=v12", isDev: false })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "?mockup=v12&ui=v12", isDev: false })).toBe("shell-v12");
    expect(getRendererUiMode({ search: "?mockup=v12&ui=v11", isDev: false })).toBe("v11");
  });
});
