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

export function remoteEditSessionKey(tabId: string, connectionId: string, remotePath: string): string {
  return `${tabId}\u0000${connectionId}\u0000${remotePath}`;
}

export function remoteEditRemoteChanged(baseline: RemoteEditBaseline, remote: RemoteEditBaseline): boolean {
  return baseline.size !== remote.size || baseline.modifyTime !== remote.modifyTime;
}

export function transitionRemoteEditSession(
  session: RemoteEditSession,
  patch: Partial<Pick<RemoteEditSession, "state" | "error" | "baseline" | "lastLocalSize" | "lastLocalMtimeMs">>,
  now = Date.now()
): RemoteEditSession {
  return {
    ...session,
    ...patch,
    error: patch.error ?? session.error,
    updatedAt: now
  };
}
