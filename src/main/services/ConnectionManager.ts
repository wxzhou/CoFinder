import SftpClient from "ssh2-sftp-client";
import { randomUUID } from "node:crypto";
import type { ConnectionConfig } from "../../shared/types/models";

export type ManagedConnection = {
  id: string;
  client: SftpClient;
  config: ConnectionConfig;
  homePath: string;
};

export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly closeListeners = new Set<(connectionId: string) => void>();
  private readonly notifiedClosedConnectionIds = new Set<string>();

  onConnectionClosed(listener: (connectionId: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  async createConnection(config: ConnectionConfig): Promise<ManagedConnection> {
    const client = new SftpClient();
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3
    });

    const homePath = await client.realPath(".");
    const id = randomUUID();
    const connection: ManagedConnection = {
      id,
      client,
      config,
      homePath: homePath || "/"
    };
    const forgetConnection = () => {
      this.connections.delete(id);
      this.notifyConnectionClosed(id);
    };
    client.on("close", forgetConnection);
    client.on("end", forgetConnection);
    client.on("error", forgetConnection);
    this.connections.set(id, connection);
    return connection;
  }

  getConnection(connectionId: string): ManagedConnection | undefined {
    return this.connections.get(connectionId);
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    this.notifyConnectionClosed(connectionId);
    await connection.client.end();
  }

  async disconnectAll(): Promise<void> {
    const all = Array.from(this.connections.keys());
    await Promise.all(all.map((id) => this.disconnect(id)));
  }

  has(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  private notifyConnectionClosed(connectionId: string): void {
    if (this.notifiedClosedConnectionIds.has(connectionId)) return;
    this.notifiedClosedConnectionIds.add(connectionId);
    for (const listener of this.closeListeners) listener(connectionId);
  }
}
