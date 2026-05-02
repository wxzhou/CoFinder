import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { normalizeLocalPath } from "../utils/pathSafety";

type SpawnLike = typeof spawn;

export class QuickLookServiceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "UNSUPPORTED_TYPE" | "PREVIEW_FAILED",
    message: string
  ) {
    super(message);
    this.name = "QuickLookServiceError";
  }
}

export class QuickLookService {
  constructor(private readonly spawnLike: SpawnLike = spawn) {}

  async previewLocalPath(targetPath: string): Promise<void> {
    const normalizedPath = normalizeLocalPath(targetPath);
    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(normalizedPath);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") throw new QuickLookServiceError("NOT_FOUND", "Path not found.");
      throw new QuickLookServiceError("PREVIEW_FAILED", "Failed to inspect path for Quick Look.");
    }

    if (!stat.isFile()) {
      throw new QuickLookServiceError("UNSUPPORTED_TYPE", "Quick Look currently supports local files only.");
    }

    try {
      const child = this.spawnLike("qlmanage", ["-p", normalizedPath], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
    } catch {
      throw new QuickLookServiceError("PREVIEW_FAILED", "Failed to launch macOS Quick Look.");
    }
  }
}
