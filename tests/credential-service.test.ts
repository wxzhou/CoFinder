import { describe, expect, it, vi } from "vitest";
import { CredentialService, type CredentialProvider } from "../src/main/services/CredentialService";

function mockProvider(): CredentialProvider {
  return {
    get: vi.fn(async () => "secret"),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    has: vi.fn(async () => true),
    isStorageAvailable: vi.fn(() => true)
  };
}

describe("CredentialService", () => {
  it("delegates credential operations to the configured provider", async () => {
    const provider = mockProvider();
    const service = new CredentialService(provider);

    await expect(service.get("profile-1")).resolves.toBe("secret");
    await service.set("profile-1", "new-secret");
    await service.delete("profile-1");
    await expect(service.has("profile-1")).resolves.toBe(true);
    expect(service.isStorageAvailable()).toBe(true);

    expect(provider.get).toHaveBeenCalledWith("profile-1");
    expect(provider.set).toHaveBeenCalledWith("profile-1", "new-secret");
    expect(provider.delete).toHaveBeenCalledWith("profile-1");
    expect(provider.has).toHaveBeenCalledWith("profile-1");
    expect(provider.isStorageAvailable).toHaveBeenCalled();
  });
});
