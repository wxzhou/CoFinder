import fs from "node:fs/promises";
import path from "node:path";
import type { ServerProfile } from "../../shared/types/models";
import { writePrivateUtf8File } from "../security/privateAtomicWrite";

type ProfilesFileV1 = {
  version: 1;
  profiles: ServerProfile[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePort(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return null;
  return n;
}

function sanitizeProfile(raw: unknown): ServerProfile | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  const host = typeof raw.host === "string" ? raw.host.trim() : "";
  const username = typeof raw.username === "string" ? raw.username.trim() : "";
  const alias = typeof raw.alias === "string" ? raw.alias.trim() : "";
  const port = parsePort(raw.port);
  if (!id || !host || !username || port === null) return null;
  const authType = raw.authType === "privateKey" ? "privateKey" : "password";
  const defaultRemotePath =
    typeof raw.defaultRemotePath === "string" && raw.defaultRemotePath.trim()
      ? raw.defaultRemotePath.trim()
      : undefined;
  const privateKeyPath =
    typeof raw.privateKeyPath === "string" && raw.privateKeyPath.trim()
      ? raw.privateKeyPath.trim()
      : undefined;
  const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  return {
    id,
    alias,
    host,
    port,
    username,
    defaultRemotePath,
    authType,
    privateKeyPath,
    createdAt,
    updatedAt
  };
}

function stripForDisk(profile: ServerProfile): ServerProfile {
  return {
    id: profile.id,
    alias: profile.alias,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    defaultRemotePath: profile.defaultRemotePath,
    authType: profile.authType,
    privateKeyPath: profile.privateKeyPath,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

export class ProfileRepository {
  constructor(private readonly filePath: string) {}

  async loadAll(): Promise<ServerProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ProfilesFileV1>;
      if (parsed?.version !== 1 || !Array.isArray(parsed.profiles)) {
        return [];
      }
      const out: ServerProfile[] = [];
      for (const item of parsed.profiles) {
        const p = sanitizeProfile(item);
        if (p) out.push(p);
      }
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return [];
      console.error("[ProfileRepository] Failed to read profiles file.", { code });
      return [];
    }
  }

  async saveAll(profiles: ServerProfile[]): Promise<void> {
    const disk: ProfilesFileV1 = {
      version: 1,
      profiles: profiles.map(stripForDisk)
    };
    await writePrivateUtf8File(this.filePath, `${JSON.stringify(disk, null, 2)}\n`);
  }

  async upsert(profile: ServerProfile): Promise<void> {
    const all = await this.loadAll();
    const idx = all.findIndex((p) => p.id === profile.id);
    const next = stripForDisk(profile);
    if (idx >= 0) {
      all[idx] = next;
    } else {
      all.push(next);
    }
    await this.saveAll(all);
  }

  async delete(id: string): Promise<boolean> {
    const all = await this.loadAll();
    const next = all.filter((p) => p.id !== id);
    if (next.length === all.length) return false;
    await this.saveAll(next);
    return true;
  }
}

export function defaultProfilesPath(userData: string): string {
  return path.join(userData, "profiles.json");
}

export function defaultCredentialsPath(userData: string): string {
  return path.join(userData, "credentials.enc.json");
}
