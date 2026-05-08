import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(async () => "")
  }
}));

describe("sniffPreviewKind", () => {
  it("detects text without relying on extension", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from("#!/bin/sh\necho hello\n", "utf8"))).toBe("text");
  });

  it("rejects binary-looking content", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from([0x00, 0x01, 0x02, 0xff]))).toBeNull();
  });

  it("detects common image magic bytes", async () => {
    const { sniffPreviewKind } = await import("../src/main/services/RemotePreviewService");
    expect(sniffPreviewKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image");
    expect(sniffPreviewKind(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe("image");
  });
});
