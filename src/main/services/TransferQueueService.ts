export class TransferQueueService {
  async enqueueUpload(_tabId: string, _sources: string[], _target: string): Promise<{ queued: boolean }> {
    return { queued: true };
  }

  async enqueueDownload(_tabId: string, _sources: string[], _target: string): Promise<{ queued: boolean }> {
    return { queued: true };
  }

  async cancel(_taskId: string): Promise<void> {
    return;
  }
}
