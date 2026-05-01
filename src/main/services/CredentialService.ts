export interface CredentialProvider {
  get(profileId: string): Promise<string | null>;
  set(profileId: string, password: string): Promise<void>;
  delete(profileId: string): Promise<void>;
  has(profileId: string): Promise<boolean>;
  isStorageAvailable(): boolean;
}

export class CredentialService {
  constructor(private readonly provider: CredentialProvider) {}

  isStorageAvailable(): boolean {
    return this.provider.isStorageAvailable();
  }

  get(profileId: string): Promise<string | null> {
    return this.provider.get(profileId);
  }

  set(profileId: string, password: string): Promise<void> {
    return this.provider.set(profileId, password);
  }

  delete(profileId: string): Promise<void> {
    return this.provider.delete(profileId);
  }

  has(profileId: string): Promise<boolean> {
    return this.provider.has(profileId);
  }
}
