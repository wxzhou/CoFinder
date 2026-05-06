import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileRepository } from "../src/main/services/ProfileRepository";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-profile-test-"));
  tempDirs.push(dir);
  return {
    repo: new ProfileRepository(path.join(dir, "profiles.json")),
    filePath: path.join(dir, "profiles.json")
  };
}

describe("ProfileRepository", () => {
  it("does not persist password or hasSavedPassword fields", async () => {
    const { repo, filePath } = await makeRepo();
    await repo.saveAll([
      {
        id: "p1",
        alias: "site",
        host: "example.com",
        port: 22,
        username: "alice",
        authType: "password",
        createdAt: 1,
        updatedAt: 2,
        hasSavedPassword: true
      } as any
    ]);

    const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as { profiles: Array<Record<string, unknown>> };
    const saved = raw.profiles[0];
    expect(saved.password).toBeUndefined();
    expect(saved.hasSavedPassword).toBeUndefined();
    expect(saved.passphrase).toBeUndefined();
    expect(saved.privateKeyContent).toBeUndefined();

    const st = await fs.stat(filePath);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("returns empty list on corrupted JSON and does not throw", async () => {
    const { repo, filePath } = await makeRepo();
    await fs.writeFile(filePath, "{bad-json", "utf8");

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(repo.loadAll()).resolves.toEqual([]);
    spy.mockRestore();
  });
});
