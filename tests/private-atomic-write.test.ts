import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writePrivateUtf8File } from "../src/main/security/privateAtomicWrite";

describe("writePrivateUtf8File", () => {
  it("writes utf8 contents with restrictive POSIX permissions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-private-write-"));
    const file = path.join(dir, "nested", "secret.json");

    await writePrivateUtf8File(file, '{"ok":true}\n');

    await expect(fs.readFile(file, "utf8")).resolves.toBe('{"ok":true}\n');
    const mode = (await fs.stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("removes the temp file if the committed write fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-private-write-"));
    const file = path.join(dir, "target");
    await fs.mkdir(file);

    await expect(writePrivateUtf8File(file, "data")).rejects.toBeTruthy();
    await expect(fs.access(`${file}.tmp`)).rejects.toBeTruthy();
  });
});
