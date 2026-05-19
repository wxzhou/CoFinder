import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const realPathMock = vi.fn();
const endMock = vi.fn();
const onMock = vi.fn();

vi.mock("ssh2-sftp-client", () => ({
  default: vi.fn(() => ({
    connect: connectMock,
    realPath: realPathMock,
    end: endMock,
    on: onMock
  }))
}));

describe("ConnectionManager", () => {
  beforeEach(() => {
    connectMock.mockReset().mockResolvedValue(undefined);
    realPathMock.mockReset().mockResolvedValue("/home/alice");
    endMock.mockReset().mockResolvedValue(undefined);
    onMock.mockReset();
  });

  it("creates and tracks a managed SFTP connection", async () => {
    const { ConnectionManager } = await import("../src/main/services/ConnectionManager");
    const manager = new ConnectionManager();
    const connection = await manager.createConnection({
      host: "example.com",
      port: 2222,
      username: "alice",
      password: "session-only"
    });

    expect(connectMock).toHaveBeenCalledWith({
      host: "example.com",
      port: 2222,
      username: "alice",
      password: "session-only",
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3
    });
    expect(onMock).toHaveBeenCalledWith("close", expect.any(Function));
    expect(onMock).toHaveBeenCalledWith("end", expect.any(Function));
    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
    expect(connection.homePath).toBe("/home/alice");
    expect(manager.has(connection.id)).toBe(true);
    expect(manager.getConnection(connection.id)).toBe(connection);
  });

  it("removes tracked connections when the client emits lifecycle events", async () => {
    const { ConnectionManager } = await import("../src/main/services/ConnectionManager");
    const manager = new ConnectionManager();
    const connection = await manager.createConnection({ host: "example.com", port: 22, username: "alice" });
    const closeHandler = onMock.mock.calls.find(([event]) => event === "close")?.[1] as (() => void) | undefined;

    closeHandler?.();

    expect(manager.has(connection.id)).toBe(false);
  });

  it("falls back to root when SFTP realPath returns an empty home", async () => {
    realPathMock.mockResolvedValue("");
    const { ConnectionManager } = await import("../src/main/services/ConnectionManager");
    const connection = await new ConnectionManager().createConnection({
      host: "example.com",
      port: 22,
      username: "alice"
    });

    expect(connection.homePath).toBe("/");
  });

  it("removes connections before ending them and ignores missing ids", async () => {
    const { ConnectionManager } = await import("../src/main/services/ConnectionManager");
    const manager = new ConnectionManager();
    const connection = await manager.createConnection({ host: "example.com", port: 22, username: "alice" });

    await manager.disconnect(connection.id);
    await manager.disconnect("missing");

    expect(manager.has(connection.id)).toBe(false);
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it("disconnects all tracked connections", async () => {
    const { ConnectionManager } = await import("../src/main/services/ConnectionManager");
    const manager = new ConnectionManager();
    await manager.createConnection({ host: "one.example.com", port: 22, username: "alice" });
    await manager.createConnection({ host: "two.example.com", port: 22, username: "bob" });

    await manager.disconnectAll();

    expect(endMock).toHaveBeenCalledTimes(2);
  });
});
