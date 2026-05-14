export type { RemoteEditBaseline, RemoteEditSession, RemoteEditSessionState } from "../../shared/remoteEdit";
import type { RemoteEditBaseline, RemoteEditSession } from "../../shared/remoteEdit";

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
