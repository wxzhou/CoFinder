import { describe, expect, it } from "vitest";
import {
  buildRsyncDownloadArgs,
  buildRsyncRemoteSpec,
  buildRsyncUploadArgs,
  buildSshSpec,
  validateRsyncPath
} from "../src/main/services/TransferQueueService";

describe("rsync arg helpers", () => {
  it("builds upload args with BatchMode and ssh port", () => {
    const args = buildRsyncUploadArgs(2222, "alice", "example.com", "/tmp/file.txt", "/remote/dir/file.txt");
    expect(args).toEqual([
      "-avh",
      "--progress",
      "-e",
      "ssh -p 2222 -o BatchMode=yes",
      "/tmp/file.txt",
      "alice@example.com:/remote/dir/file.txt"
    ]);
  });

  it("builds download args with BatchMode and ssh port", () => {
    const args = buildRsyncDownloadArgs(22, "bob", "host", "/remote/data.txt", "/local/target");
    expect(args).toEqual([
      "-avh",
      "--progress",
      "-e",
      "ssh -p 22 -o BatchMode=yes",
      "bob@host:/remote/data.txt",
      "/local/target"
    ]);
  });

  it("normalizes remote path with POSIX rules", () => {
    expect(validateRsyncPath("foo/../bar")).toBe("/bar");
  });

  it("rejects dangerous/unsupported remote path characters", () => {
    expect(() => validateRsyncPath("/tmp/a\nfile")).toThrow(/unsupported|required|contains/i);
    expect(() => validateRsyncPath("/tmp/file$bad")).toThrow(/unsupported/i);
  });

  it("rejects invalid host or username", () => {
    expect(() => buildRsyncRemoteSpec("bad user", "example.com", "/a")).toThrow(/Invalid username or host/i);
    expect(() => buildRsyncRemoteSpec("alice", "bad:host", "/a")).toThrow(/Invalid username or host/i);
  });

  it("contains BatchMode in ssh spec", () => {
    expect(buildSshSpec(2022)).toContain("BatchMode=yes");
  });

  it("does not include password in args", () => {
    const args = buildRsyncUploadArgs(22, "alice", "example.com", "/tmp/file.txt", "/remote/x");
    expect(args.join(" ")).not.toContain("password");
  });

  it("keeps directory semantic without trailing slash mutation", () => {
    const args = buildRsyncUploadArgs(22, "alice", "example.com", "/tmp/folder", "/remote/folder");
    expect(args[4]).toBe("/tmp/folder");
    expect(args[5]).toBe("alice@example.com:/remote/folder");
  });
});
