import { describe, expect, it } from "vitest";
import { assertSafeRemotePath, isSafeHostOrUsername, normalizeRemotePosixPath } from "../src/main/utils/pathSafety";
import { buildProcessEnv } from "../src/main/utils/processEnv";
import { profilePrimaryLabel } from "../src/renderer/profilePrimaryLabel";
import type { ServerProfile } from "../src/shared/types/models";

describe("pathSafety", () => {
  it("normalizes remote paths with POSIX semantics", () => {
    expect(normalizeRemotePosixPath("foo/../bar")).toBe("/bar");
    expect(normalizeRemotePosixPath("")).toBe("/");
  });

  it("rejects remote paths with unsupported transfer characters", () => {
    expect(assertSafeRemotePath("/safe/path-1")).toBe("/safe/path-1");
    expect(() => assertSafeRemotePath("/unsafe/$HOME")).toThrow(/unsupported/i);
    expect(() => assertSafeRemotePath("/unsafe\npath")).toThrow(/unsupported/i);
  });

  it("validates host and username characters", () => {
    expect(isSafeHostOrUsername("alice_1.example-host")).toBe(true);
    expect(isSafeHostOrUsername("alice@example.com")).toBe(false);
    expect(isSafeHostOrUsername("alice user")).toBe(false);
  });
});

describe("buildProcessEnv", () => {
  it("preserves caller env and appends fallback PATH segments once", () => {
    const env = buildProcessEnv({ PATH: "/custom:/usr/bin", HOME: "/tmp/home" });
    const segments = env.PATH?.split(":") ?? [];

    expect(env.HOME).toBe("/tmp/home");
    expect(segments[0]).toBe("/custom");
    expect(segments.filter((segment) => segment === "/usr/bin")).toHaveLength(1);
    expect(segments).toContain("/opt/homebrew/bin");
    expect(segments).toContain("/usr/local/bin");
  });
});

describe("profilePrimaryLabel", () => {
  const baseProfile: ServerProfile = {
    id: "p1",
    alias: "",
    host: "example.com",
    port: 2222,
    username: "alice",
    createdAt: 1,
    updatedAt: 2
  };

  it("prefers a trimmed alias", () => {
    expect(profilePrimaryLabel({ ...baseProfile, alias: "  Prod  " })).toBe("Prod");
  });

  it("falls back to user host and port", () => {
    expect(profilePrimaryLabel(baseProfile)).toBe("alice@example.com:2222");
  });
});
