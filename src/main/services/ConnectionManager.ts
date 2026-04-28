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

  async createConnection(config: ConnectionConfig): Promise<ManagedConnection> {
    const client = new SftpClient();
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password
    });

    const homePath = await client.realPath(".");
    const id = randomUUID();
    const connection: ManagedConnection = {
      id,
      client,
      config,
      homePath: homePath || "/"
    };
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
    await connection.client.end();
  }

  async disconnectAll(): Promise<void> {
    const all = Array.from(this.connections.keys());
    await Promise.all(all.map((id) => this.disconnect(id)));
  }

  has(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }
}
