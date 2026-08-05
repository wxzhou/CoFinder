/**
 * Tauri renderer bridge for CoFinder.
 *
 * Replaces the Electron preload (`src/preload/index.ts`) under a Tauri shell.
 * Every `window.cofinder.<ns>.<method>(request)` call is forwarded to the Rust
 * command `cofinder_call` as a channel string `"<ns>:<method>"`, which the Rust
 * host relays to the Node sidecar. Event subscriptions (`onXxx`) listen for the
 * `cofinder:event` Tauri event and dispatch by channel.
 *
 * The response contract `{ ok: true, data } | { ok: false, error }` is preserved
 * end-to-end, so the React UI needs no changes for data access.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppSettings,
  ContentViewerOpenRequest,
  IpcResponse,
  LocalListDirectoryResponse,
  PathInfo,
  ProfileUpsertPayload,
  RemoteConnectResponse,
  RemoteDirectorySizeUpdatePayload,
  RemoteEditUpdatePayload,
  RemoteListDirectoryResponse,
  TextContentReadResponse,
  TextLineWindowReadResponse,
  TextSearchResponse,
  TransferConflictCheckResponse,
  TransferUpdatePayload
} from "../shared/types/ipc";
import type { LocalFavoriteListItem } from "../shared/localFavorites";
import type { RemoteEditSession } from "../shared/remoteEdit";
import type { ServerProfile, TransferTask } from "../shared/types/models";

/** Invoke a single sidecar channel and return the `{ ok, data } | { ok, error }` response. */
function call<T>(channel: string, request?: unknown): Promise<IpcResponse<T>> {
  return invoke<IpcResponse<T>>("cofinder_call", { channel, request: request ?? null });
}

/**
 * Event channel names. Sidecar event broadcasts use the exact channel strings
 * from `src/main/ipc/channels.ts`; menu/system events come from Rust.
 */

/** Per-channel handler registry shared by all event subscriptions. */
const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();

let eventListenerInstalled = false;

function installEventListener(): void {
  if (eventListenerInstalled) return;
  eventListenerInstalled = true;
  void listen<{ channel: string; payload: unknown }>("cofinder:event", (event) => {
    const { channel, payload } = event.payload;
    const handlers = eventHandlers.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[cofinderBridge] event handler failed for ${channel}`, error);
      }
    }
  });
}

/** Subscribe to a `cofinder:event` payload for a given channel; returns unsubscribe. */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  installEventListener();
  let handlers = eventHandlers.get(channel);
  if (!handlers) {
    handlers = new Set();
    eventHandlers.set(channel, handlers);
  }
  const fn = handler as (payload: unknown) => void;
  handlers.add(fn);
  return () => {
    handlers?.delete(fn);
  };
}

/* ------------------------------------------------------------------ */
/* system:openRequest for the content window                           */
/* ------------------------------------------------------------------ */

let contentReadyNotified = false;

function subscribeContentOpenRequest(handler: (payload: ContentViewerOpenRequest) => void): () => void {
  const off = subscribe<ContentViewerOpenRequest>("content:openRequest", handler);
  // Signal the Rust host that this (content) window is ready to receive
  // buffered `content:openRequest` payloads.
  if (!contentReadyNotified) {
    contentReadyNotified = true;
    void invoke("content_window_ready");
  }
  return off;
}

/* ------------------------------------------------------------------ */
/* bridge object                                                       */
/* ------------------------------------------------------------------ */

export const cofinder = {
  local: {
    listDirectory: (request: { path: string }) => call<LocalListDirectoryResponse>("local:listDirectory", request),
    openPath: (request: { path: string }) => call<{ opened: true }>("local:openPath", request),
    revealPath: (request: { path: string }) => call<{ revealed: true }>("local:revealPath", request),
    getHomePath: () => call<{ homePath: string }>("local:getHomePath"),
    rename: (request: { path: string; newName: string }) =>
      call<{ renamed: true; newPath: string }>("local:rename", request),
    delete: (request: { paths: string[] }) => call<{ deleted: number }>("local:delete", request),
    mkdir: (request: { parentPath: string; name: string }) =>
      call<{ created: true; path: string }>("local:mkdir", request),
    createTextFile: (request: { parentPath: string; name?: string }) =>
      call<{ created: true; path: string }>("local:createTextFile", request),
    compressGzip: (request: { path: string }) => call<{ compressed: true; path: string }>("local:compressGzip", request),
    touch: (request: { path: string; timestamp?: string }) => call<{ touched: true }>("local:touch", request),
    getInfo: (request: { path: string; includeDirectorySize?: boolean }) =>
      call<{ info: PathInfo }>("local:getInfo", request),
    readText: (request: { path: string; byteOffset?: number; maxBytes?: number }) =>
      call<TextContentReadResponse>("local:readText", request),
    readTextWindow: (request: { path: string; targetLine: number; contextBefore?: number; contextAfter?: number }) =>
      call<TextLineWindowReadResponse>("local:readTextWindow", request),
    readPreview: (request: { path: string; maxTextBytes?: number; maxImageBytes?: number }) =>
      call<import("../shared/types/ipc").FilePreviewReadResponse>("local:readPreview", request),
    searchText: (request: { path: string; query: string; maxMatches?: number }) =>
      call<TextSearchResponse>("local:searchText", request)
  },
  remote: {
    connect: (request: import("../shared/types/ipc").RemoteConnectRequest) =>
      call<RemoteConnectResponse>("remote:connect", request),
    listDirectory: (request: { connectionId: string; path: string }) =>
      call<RemoteListDirectoryResponse>("remote:listDirectory", request),
    disconnect: (request: { connectionId: string }) => call<{ disconnected: true }>("remote:disconnect", request),
    getHomeDirectory: (request: { connectionId: string }) =>
      call<{ homePath: string }>("remote:getHomeDirectory", request),
    rename: (request: { connectionId: string; path: string; newName: string }) =>
      call<{ renamed: true; newPath: string }>("remote:rename", request),
    delete: (request: { connectionId: string; paths: string[] }) =>
      call<{ deleted: number }>("remote:delete", request),
    getInfo: (request: { connectionId: string; path: string; includeDirectorySize?: boolean }) =>
      call<{ info: PathInfo }>("remote:getInfo", request),
    readText: (request: { connectionId: string; path: string; byteOffset?: number; maxBytes?: number }) =>
      call<TextContentReadResponse>("remote:readText", request),
    readTextWindow: (request: { connectionId: string; path: string; targetLine: number; contextBefore?: number; contextAfter?: number }) =>
      call<TextLineWindowReadResponse>("remote:readTextWindow", request),
    readPreview: (request: { connectionId: string; path: string; maxTextBytes?: number; maxImageBytes?: number }) =>
      call<import("../shared/types/ipc").FilePreviewReadResponse>("remote:readPreview", request),
    searchText: (request: { connectionId: string; path: string; query: string; maxMatches?: number }) =>
      call<TextSearchResponse>("remote:searchText", request),
    mkdir: (request: { connectionId: string; parentPath: string; name: string }) =>
      call<{ created: true; path: string }>("remote:mkdir", request),
    createTextFile: (request: { connectionId: string; parentPath: string; name?: string }) =>
      call<{ created: true; path: string }>("remote:createTextFile", request),
    compressGzip: (request: { connectionId: string; path: string }) =>
      call<{ compressed: true; path: string }>("remote:compressGzip", request),
    touch: (request: { connectionId: string; path: string; timestamp?: string }) =>
      call<{ touched: true }>("remote:touch", request),
    chmod: (request: { connectionId: string; path: string; mode: string }) =>
      call<{ changed: true }>("remote:chmod", request),
    duplicate: (request: { connectionId: string; path: string }) =>
      call<{ duplicated: true; newPath: string }>("remote:duplicate", request),
    directorySizeStart: (request: { connectionId: string; path: string }) =>
      call<{ jobId: string }>("remote:directorySizeStart", request),
    directorySizeCancel: (request: { jobId: string }) =>
      call<{ canceled: true }>("remote:directorySizeCancel", request),
    onDirectorySizeUpdate: (handler: (payload: RemoteDirectorySizeUpdatePayload) => void) =>
      subscribe("remote:directorySizeUpdate", handler),
    previewOpen: (request: { tabId: string; connectionId: string; path: string }) =>
      call<{ opened: true; localPath: string; kind: "text" | "image" }>("remote:previewOpen", request),
    previewClearForTab: (request: { tabId: string }) => call<{ cleared: number }>("remote:previewClearForTab", request),
    previewClearForConnection: (request: { connectionId: string }) =>
      call<{ cleared: number }>("remote:previewClearForConnection", request),
    editOpen: (request: {
      tabId: string;
      connectionId: string;
      path: string;
      opener?: "text" | "default";
      allowBinaryText?: boolean;
      allowLargeFile?: boolean;
      allowExecutable?: boolean;
    }) => call<{ session: RemoteEditSession }>("remote:editOpen", request),
    editList: () => call<{ sessions: RemoteEditSession[] }>("remote:editList"),
    editSyncNow: (request: { sessionId: string }) => call<{ session: RemoteEditSession }>("remote:editSyncNow", request),
    editRevealLocal: (request: { sessionId: string }) =>
      call<{ revealed: true; localPath: string }>("remote:editRevealLocal", request),
    editRedownload: (request: { sessionId: string }) =>
      call<{ session: RemoteEditSession }>("remote:editRedownload", request),
    editForceUpload: (request: { sessionId: string }) =>
      call<{ session: RemoteEditSession }>("remote:editForceUpload", request),
    editDownloadConflictCopy: (request: { sessionId: string }) =>
      call<{ session: RemoteEditSession; remoteCopyPath: string }>("remote:editDownloadConflictCopy", request),
    editCopyConflictPaths: (request: { sessionId: string }) =>
      call<{ copied: true; text: string }>("remote:editCopyConflictPaths", request),
    editClose: (request: { sessionId: string; discardLocal?: boolean }) =>
      call<{ closed: true }>("remote:editClose", request),
    onEditUpdate: (handler: (payload: RemoteEditUpdatePayload) => void) => subscribe("remote:editUpdate", handler)
  },
  content: {
    openWindow: (request: ContentViewerOpenRequest) => call<{ opened: true }>("content:openWindow", request),
    onOpenRequest: (handler: (payload: ContentViewerOpenRequest) => void) => subscribeContentOpenRequest(handler)
  },
  transfer: {
    checkUploadConflicts: (request: unknown) => call<TransferConflictCheckResponse>("transfer:checkUploadConflicts", request),
    checkDownloadConflicts: (request: unknown) =>
      call<TransferConflictCheckResponse>("transfer:checkDownloadConflicts", request),
    enqueueUpload: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueUpload", request),
    enqueueDownload: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueDownload", request),
    enqueueDelete: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueDelete", request),
    enqueueGzip: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueGzip", request),
    enqueueDecompress: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueDecompress", request),
    enqueueMd5: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueMd5", request),
    enqueueRemoteCopy: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueRemoteCopy", request),
    enqueueRemoteMove: (request: unknown) => call<{ queued: true; taskIds: string[] }>("transfer:enqueueRemoteMove", request),
    cancel: (request: { taskId: string }) => call<{ canceled: true }>("transfer:cancel", request),
    stop: (request: { taskId: string }) => call<{ stopped: true }>("transfer:stop", request),
    retry: (request: { taskId: string }) => call<{ retried: true }>("transfer:retry", request),
    retryFailed: () => call<{ retried: number }>("transfer:retryFailed"),
    list: () => call<TransferTask[]>("transfer:list"),
    clearCompleted: () => call<{ cleared: number }>("transfer:clearCompleted"),
    onUpdate: (handler: (payload: TransferUpdatePayload) => void) => subscribe("transfer:onUpdate", handler)
  },
  settings: {
    get: () => call<AppSettings>("settings:get"),
    set: (request: unknown) => call<AppSettings>("settings:set", request)
  },
  localFavorites: {
    list: () => call<{ favorites: LocalFavoriteListItem[] }>("localFavorites:list"),
    add: (request: { path: string }) => call<{ favorites: LocalFavoriteListItem[] }>("localFavorites:add", request),
    remove: (request: { id: string }) => call<{ favorites: LocalFavoriteListItem[] }>("localFavorites:remove", request),
    rename: (request: { id: string; label: string }) =>
      call<{ favorites: LocalFavoriteListItem[] }>("localFavorites:rename", request),
    reorder: (request: { id: string; direction: "up" | "down" }) =>
      call<{ favorites: LocalFavoriteListItem[] }>("localFavorites:reorder", request),
    resetDefaults: () => call<{ favorites: LocalFavoriteListItem[] }>("localFavorites:resetDefaults")
  },
  profiles: {
    list: () => call<ServerProfile[]>("profiles:list"),
    save: (request: ProfileUpsertPayload) => call<ServerProfile>("profiles:save", request),
    update: (request: ProfileUpsertPayload) => call<ServerProfile>("profiles:update", request),
    delete: (request: { id: string }) => call<{ deleted: true }>("profiles:delete", request),
    addRemoteFavorite: (request: { profileId: string; path: string }) =>
      call<ServerProfile>("profiles:addRemoteFavorite", request),
    removeRemoteFavorite: (request: { profileId: string; favoriteId: string }) =>
      call<ServerProfile>("profiles:removeRemoteFavorite", request),
    renameRemoteFavorite: (request: { profileId: string; favoriteId: string; label: string }) =>
      call<ServerProfile>("profiles:renameRemoteFavorite", request),
    reorderRemoteFavorite: (request: { profileId: string; favoriteId: string; direction: "up" | "down" }) =>
      call<ServerProfile>("profiles:reorderRemoteFavorite", request)
  },
  credentials: {
    isAvailable: () => call<{ available: boolean }>("credentials:isAvailable")
  },
  system: {
    copyText: (request: { text: string }) => call<{ copied: true }>("system:copyText", request),
    quickLook: (request: { path: string }) => call<{ opened: true }>("system:quickLook", request),
    openTerminal: (request: { path: string }) => call<{ opened: true }>("system:openTerminal", request),
    openSshTerminal: (request: { host: string; port: number; username: string; remotePath?: string }) =>
      call<{ opened: true }>("system:openSshTerminal", request),
    getAppVersion: () => call<{ version: string }>("system:getAppVersion"),
    openLogFolder: () => call<{ opened: true; path: string }>("system:openLogFolder"),
    openLogFile: () => call<{ opened: true; path: string }>("system:openLogFile"),
    copyDiagnostics: () =>
      call<{ copied: true; diagnostics: import("../shared/types/ipc").DiagnosticsBundle }>("system:copyDiagnostics"),
    checkForUpdates: () => call<{ available: false; message: string }>("system:checkForUpdates"),
    onOpenPreferences: (handler: () => void) => subscribe("system:openPreferences", handler),
    onSetPaneViewMode: (handler: (payload: { pane: "local" | "remote"; viewMode: import("../shared/types/ipc").PaneViewMode }) => void) =>
      subscribe("system:setPaneViewMode", handler),
    onTogglePaneGroupByType: (handler: (payload: { pane: "local" | "remote" }) => void) =>
      subscribe("system:togglePaneGroupByType", handler),
    onSystemResume: (handler: () => void) => subscribe("system:resume", handler)
  }
} satisfies import("../shared/types/ipc").IpcApi;
