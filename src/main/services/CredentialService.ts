export interface CredentialProvider {
  get(profileId: string): Promise<string | null>;
  set(profileId: string, password: string): Promise<void>;
  delete(profileId: string): Promise<void>;
}

export class CredentialService {
  constructor(private readonly provider: CredentialProvider) {}

  get(profileId: string): Promise<string | null> {
    return this.provider.get(profileId);
  }

  set(profileId: string, password: string): Promise<void> {
    return this.provider.set(profileId, password);
  }

  delete(profileId: string): Promise<void> {
    return this.provider.delete(profileId);
  }
}
