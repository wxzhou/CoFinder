export type RemoteEditSessionState = "clean" | "dirty" | "uploading" | "uploaded" | "failed" | "conflict";

export type RemoteEditBaseline = {
  size: number;
  modifyTime: number;
};

export type RemoteEditSession = {
  id: string;
  tabId: string;
  connectionId: string;
  remotePath: string;
  localPath: string;
  baseline: RemoteEditBaseline;
  lastLocalSize: number;
  lastLocalMtimeMs: number;
  state: RemoteEditSessionState;
  error: string;
  updatedAt: number;
};
