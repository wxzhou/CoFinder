import { describe, expect, it } from "vitest";
import {
  AppError,
  fail,
  normalizeRemotePathInput,
  requiredHost,
  requiredPort,
  requiredUsername,
  toIpcError,
  validateLocalPathInput
} from "../src/main/ipc/ipcUtils";

describe("ipcUtils validation", () => {
  it("validates hosts, usernames, and ports", () => {
    expect(requiredHost("host-1.example", "REMOTE_INVALID_INPUT")).toBe("host-1.example");
    expect(requiredUsername("alice_1", "REMOTE_INVALID_INPUT")).toBe("alice_1");
    expect(requiredPort("2222", "REMOTE_INVALID_INPUT")).toBe(2222);
    expect(() => requiredHost("bad host", "REMOTE_INVALID_INPUT")).toThrow(AppError);
    expect(() => requiredUsername("alice@example", "REMOTE_INVALID_INPUT")).toThrow(AppError);
    expect(() => requiredPort(70000, "REMOTE_INVALID_INPUT")).toThrow(AppError);
  });

  it("normalizes remote paths and rejects control characters", () => {
    expect(normalizeRemotePathInput("foo/../bar", "REMOTE_INVALID_INPUT")).toBe("/bar");
    expect(normalizeRemotePathInput(".", "REMOTE_INVALID_INPUT")).toBe("/");
    expect(() => normalizeRemotePathInput("/bad\npath", "REMOTE_INVALID_INPUT")).toThrow(AppError);
  });

  it("resolves local paths and rejects control characters", () => {
    expect(validateLocalPathInput(".", "LOCAL_INVALID_INPUT")).toContain("CoFinder");
    expect(() => validateLocalPathInput("bad\rpath", "LOCAL_INVALID_INPUT")).toThrow(AppError);
  });
});

describe("ipcUtils errors", () => {
  it("returns a redacted failure detail", () => {
    const res = fail("REMOTE_UNKNOWN_ERROR", "Failed", "password=hunter2 token=abc");
    expect(res.error.detail).toContain("password=<redacted>");
    expect(res.error.detail).toContain("token=<redacted>");
    expect(res.error.detail).not.toContain("hunter2");
    expect(res.error.detail).not.toContain("abc");
  });

  it("maps AppError and generic coded errors into IPC failures", () => {
    expect(toIpcError(new AppError("REMOTE_NOT_FOUND", "Missing"), "REMOTE_UNKNOWN_ERROR", "fallback")).toEqual({
      ok: false,
      error: { code: "REMOTE_NOT_FOUND", message: "Missing" }
    });
    expect(toIpcError({ code: "NOT_FOUND", message: "Nope" }, "LOCAL_UNKNOWN_ERROR", "fallback").error.code).toBe("LOCAL_NOT_FOUND");
  });
});
