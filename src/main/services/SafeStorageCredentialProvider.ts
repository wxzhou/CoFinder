import { safeStorage } from "../sidecar/electronShim";
import fs from "node:fs/promises";
import type { CredentialProvider } from "./CredentialService";
import { writePrivateUtf8File } from "../security/privateAtomicWrite";

type CredentialFileV1 = {
  version: 1;
  secrets: Record<string, string>;
};

export class SafeStorageCredentialProvider implements CredentialProvider {
  constructor(private readonly filePath: string) {}

  isStorageAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async has(profileId: string): Promise<boolean> {
    if (!this.isStorageAvailable()) return false;
    const file = await this.readFile();
    return Object.prototype.hasOwnProperty.call(file.secrets, profileId);
  }

  async get(profileId: string): Promise<string | null> {
    if (!this.isStorageAvailable()) return null;
    const file = await this.readFile();
    const b64 = file.secrets[profileId];
    if (!b64) return null;
    try {
      const buf = Buffer.from(b64, "base64");
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }

  async set(profileId: string, password: string): Promise<void> {
    if (!this.isStorageAvailable()) {
      const err = new Error("Credential storage is not available on this system.");
      (err as Error & { code?: string }).code = "CREDENTIAL_UNAVAILABLE";
      throw err;
    }
    const encrypted = safeStorage.encryptString(password);
    const file = await this.readFile();
    file.secrets[profileId] = Buffer.from(encrypted).toString("base64");
    await this.writeFile(file);
  }

  async delete(profileId: string): Promise<void> {
    const file = await this.readFile();
    if (!file.secrets[profileId]) return;
    delete file.secrets[profileId];
    await this.writeFile(file);
  }

  private async readFile(): Promise<CredentialFileV1> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CredentialFileV1>;
      if (parsed?.version !== 1 || typeof parsed.secrets !== "object" || parsed.secrets === null) {
        return { version: 1, secrets: {} };
      }
      return { version: 1, secrets: { ...parsed.secrets } };
    } catch {
      return { version: 1, secrets: {} };
    }
  }

  private async writeFile(data: CredentialFileV1): Promise<void> {
    await writePrivateUtf8File(this.filePath, `${JSON.stringify(data)}\n`);
  }
}
