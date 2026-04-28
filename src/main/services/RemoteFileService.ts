export class RemoteFileService {
  async connect(_profileId: string): Promise<{ connected: boolean }> {
    return { connected: false };
  }

  async listDirectory(_tabId: string, _path: string): Promise<unknown[]> {
    return [];
  }

  async disconnect(_tabId: string): Promise<void> {
    return;
  }
}
