import { describe, expect, it } from "vitest";
import { getRendererUiMode } from "../src/renderer/uiMode";

describe("getRendererUiMode", () => {
  it("returns v11 when no v12 params", () => {
    expect(getRendererUiMode({ search: "", isDev: true })).toBe("v11");
    expect(getRendererUiMode({ search: "?foo=1", isDev: true })).toBe("v11");
    expect(getRendererUiMode({ search: "?ui=other", isDev: true })).toBe("v11");
  });

  it("returns shell-v12 when ui=v12 (dev)", () => {
    expect(getRendererUiMode({ search: "?ui=v12", isDev: true })).toBe("shell-v12");
  });

  it("returns shell-v12 when ui=v12 (non-dev, e.g. packaged file URL with hash query)", () => {
    expect(getRendererUiMode({ search: "?ui=v12", isDev: false })).toBe("shell-v12");
  });

  it("accepts search with or without leading ?", () => {
    expect(getRendererUiMode({ search: "ui=v12", isDev: true })).toBe("shell-v12");
  });

  it("mockup=v12 wins in dev over ui=v12", () => {
    expect(getRendererUiMode({ search: "?ui=v12&mockup=v12", isDev: true })).toBe("mockup-v12");
    expect(getRendererUiMode({ search: "?mockup=v12&ui=v12", isDev: true })).toBe("mockup-v12");
  });

  it("mockup=v12 does not apply when not dev (production shell path unchanged)", () => {
    expect(getRendererUiMode({ search: "?mockup=v12", isDev: false })).toBe("v11");
    expect(getRendererUiMode({ search: "?mockup=v12&ui=v12", isDev: false })).toBe("shell-v12");
  });
});
