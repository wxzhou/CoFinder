declare module "ssh2-sftp-client" {
  type SftpConnectOptions = {
    host: string;
    port: number;
    username: string;
    password?: string;
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
    list(path: string): Promise<SftpListItem[]>;
    stat(path: string): Promise<{ type: string; size?: number; modifyTime?: number }>;
    realPath(path: string): Promise<string>;
    get(path: string, localPath?: string): Promise<Buffer | unknown>;
    fastGet(path: string, localPath: string): Promise<unknown>;
    put(input: Buffer | string, remotePath: string): Promise<unknown>;
  }
}
