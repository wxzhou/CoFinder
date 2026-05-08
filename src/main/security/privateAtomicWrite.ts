import fs from "node:fs/promises";
import path from "node:path";

const PRIVATE_MODE = 0o600;

/**
 * Atomic UTF-8 write for sensitive JSON files: tmp with 0o600, rename, chmod 0o600.
 * chmod failure is logged generically (no path/content); write is still considered committed.
 */
export async function writePrivateUtf8File(targetPath: string, contents: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${targetPath}.tmp`;
  try {
    await fs.writeFile(tmp, contents, { encoding: "utf8", mode: PRIVATE_MODE });
    await fs.rename(tmp, targetPath);
    try {
      await fs.chmod(targetPath, PRIVATE_MODE);
    } catch {
      console.error("[CoFinder] Failed to set restrictive permissions on a sensitive config file.");
    }
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}
