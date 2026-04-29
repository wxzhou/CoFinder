import type { CredentialProvider } from "../CredentialService";

export class InMemoryCredentialProvider implements CredentialProvider {
  private readonly store = new Map<string, string>();

  isStorageAvailable(): boolean {
    return true;
  }

  async has(profileId: string): Promise<boolean> {
    const v = this.store.get(profileId);
    return v !== undefined && v.length > 0;
  }

  async get(profileId: string): Promise<string | null> {
    return this.store.get(profileId) ?? null;
  }

  async set(profileId: string, password: string): Promise<void> {
    this.store.set(profileId, password);
  }

  async delete(profileId: string): Promise<void> {
    this.store.delete(profileId);
  }
}
