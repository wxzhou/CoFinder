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
    stat(path: string): Promise<{ type: string }>;
    realPath(path: string): Promise<string>;
  }
}
