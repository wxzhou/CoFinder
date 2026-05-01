import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("SafeStorageCredentialProvider", () => {
  it("throws CREDENTIAL_UNAVAILABLE when safeStorage is unavailable", async () => {
    vi.resetModules();
    vi.doMock("electron", () => ({
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (text: string) => Buffer.from(text),
        decryptString: (buf: Buffer) => buf.toString("utf8")
      }
    }));

    const { SafeStorageCredentialProvider } = await import("../src/main/services/SafeStorageCredentialProvider");
    const provider = new SafeStorageCredentialProvider(path.join(os.tmpdir(), "cofinder-cred-test.json"));

    await expect(provider.set("id", "pwd")).rejects.toMatchObject({ code: "CREDENTIAL_UNAVAILABLE" });
    expect(provider.isStorageAvailable()).toBe(false);
  });
});
