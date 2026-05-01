import path from "node:path";
import { posix as posixPath } from "node:path";

const SAFE_REMOTE_PATH = /^[A-Za-z0-9._/\-@+=,: ]+$/;
const SAFE_HOST_USER = /^[A-Za-z0-9._-]+$/;

export function normalizeLocalPath(input: string): string {
  return path.resolve(input);
}

export function isSafeHostOrUsername(input: string): boolean {
  return SAFE_HOST_USER.test(input);
}

export function normalizeRemotePosixPath(input: string): string {
  const value = input.trim();
  const normalized = posixPath.normalize(value);
  if (normalized === ".") return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function assertSafeRemotePath(input: string): string {
  const normalized = normalizeRemotePosixPath(input);
  if (!SAFE_REMOTE_PATH.test(normalized)) {
    throw new Error("Path contains unsupported characters for rsync transfer in this version.");
  }
  return normalized;
}
