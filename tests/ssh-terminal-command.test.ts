import { describe, expect, it } from "vitest";
import { buildSshTerminalCommand, shellSingleQuote } from "../src/main/ipc/sshTerminalCommand";

describe("SSH terminal command", () => {
  it("uses a plain ssh command when no remote path is supplied", () => {
    expect(buildSshTerminalCommand("alice", "example.test", 22)).toBe("ssh -p 22 alice@example.test");
  });

  it("cds into a quoted remote path before opening a non-login interactive shell", () => {
    const command = buildSshTerminalCommand("alice", "example.test", 2222, "/mnt/gpfs1/Users/alice/Project Data");

    expect(command).toBe(
      `ssh -p 2222 alice@example.test -t ${shellSingleQuote(`cd -- ${shellSingleQuote("/mnt/gpfs1/Users/alice/Project Data")} && exec "\${SHELL:-/bin/bash}" -i`)}`
    );
    expect(command).not.toContain(" -l");
  });

  it("quotes apostrophes in remote paths", () => {
    const command = buildSshTerminalCommand("alice", "example.test", 22, "/tmp/Alice's Project");

    expect(command).toBe(
      `ssh -p 22 alice@example.test -t ${shellSingleQuote(`cd -- ${shellSingleQuote("/tmp/Alice's Project")} && exec "\${SHELL:-/bin/bash}" -i`)}`
    );
  });
});
