declare module "ssh2-sftp-client" {
  type SftpConnectOptions = {
    host: string;
    port: number;
    username: string;
    password?: string;
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
  };

  type SftpListItem = {
    name: string;
    type: string;
    size: number;
    modifyTime: number;
    rights?: { user: string; group: string; other: string };
    owner?: number | string;
    group?: number | string;
  };

  export default class SftpClient {
    connect(config: SftpConnectOptions): Promise<void>;
    end(): Promise<void>;
    on(eventType: "close" | "end" | "error", callback: (error?: Error) => void): void;
    list(path: string): Promise<SftpListItem[]>;
    stat(path: string): Promise<{ type: string; size?: number; modifyTime?: number }>;
    realPath(path: string): Promise<string>;
    get(path: string, localPath?: string): Promise<Buffer | unknown>;
    fastGet(path: string, localPath: string): Promise<unknown>;
    put(input: Buffer | string, remotePath: string): Promise<unknown>;
  }
}
