import type { CredentialProvider } from "../CredentialService";

export class InMemoryCredentialProvider implements CredentialProvider {
  private readonly store = new Map<string, string>();

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
