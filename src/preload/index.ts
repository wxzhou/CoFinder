import { contextBridge, ipcRenderer } from "electron";
import type { IpcApi } from "../shared/types/ipc";

const api: IpcApi = {
  local: {
    listDirectory: (request) => ipcRenderer.invoke("local:listDirectory", request),
    openPath: (request) => ipcRenderer.invoke("local:openPath", request),
    revealPath: (request) => ipcRenderer.invoke("local:revealPath", request),
    getHomePath: () => ipcRenderer.invoke("local:getHomePath"),
    rename: (request) => ipcRenderer.invoke("local:rename", request),
    delete: (request) => ipcRenderer.invoke("local:delete", request),
    mkdir: (request) => ipcRenderer.invoke("local:mkdir", request),
    createTextFile: (request) => ipcRenderer.invoke("local:createTextFile", request),
    compressGzip: (request) => ipcRenderer.invoke("local:compressGzip", request),
    touch: (request) => ipcRenderer.invoke("local:touch", request),
    getInfo: (request) => ipcRenderer.invoke("local:getInfo", request),
    readText: (request) => ipcRenderer.invoke("local:readText", request),
    readTextWindow: (request) => ipcRenderer.invoke("local:readTextWindow", request),
    readPreview: (request) => ipcRenderer.invoke("local:readPreview", request),
    searchText: (request) => ipcRenderer.invoke("local:searchText", request)
  },
  remote: {
    connect: (request) => ipcRenderer.invoke("remote:connect", request),
    listDirectory: (request) => ipcRenderer.invoke("remote:listDirectory", request),
    disconnect: (request) => ipcRenderer.invoke("remote:disconnect", request),
    getHomeDirectory: (request) => ipcRenderer.invoke("remote:getHomeDirectory", request),
    rename: (request) => ipcRenderer.invoke("remote:rename", request),
    delete: (request) => ipcRenderer.invoke("remote:delete", request),
    getInfo: (request) => ipcRenderer.invoke("remote:getInfo", request),
    readText: (request) => ipcRenderer.invoke("remote:readText", request),
    readTextWindow: (request) => ipcRenderer.invoke("remote:readTextWindow", request),
    readPreview: (request) => ipcRenderer.invoke("remote:readPreview", request),
    searchText: (request) => ipcRenderer.invoke("remote:searchText", request),
    mkdir: (request) => ipcRenderer.invoke("remote:mkdir", request),
    createTextFile: (request) => ipcRenderer.invoke("remote:createTextFile", request),
    compressGzip: (request) => ipcRenderer.invoke("remote:compressGzip", request),
    touch: (request) => ipcRenderer.invoke("remote:touch", request),
    chmod: (request) => ipcRenderer.invoke("remote:chmod", request),
    duplicate: (request) => ipcRenderer.invoke("remote:duplicate", request),
    directorySizeStart: (request) => ipcRenderer.invoke("remote:directorySizeStart", request),
    directorySizeCancel: (request) => ipcRenderer.invoke("remote:directorySizeCancel", request),
    onDirectorySizeUpdate: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) =>
        handler(payload as Parameters<typeof handler>[0]);
      ipcRenderer.on("remote:directorySizeUpdate", wrapped);
      return () => ipcRenderer.off("remote:directorySizeUpdate", wrapped);
    },
    previewOpen: (request) => ipcRenderer.invoke("remote:previewOpen", request),
    previewClearForTab: (request) => ipcRenderer.invoke("remote:previewClearForTab", request),
    previewClearForConnection: (request) => ipcRenderer.invoke("remote:previewClearForConnection", request),
    editOpen: (request) => ipcRenderer.invoke("remote:editOpen", request),
    editList: () => ipcRenderer.invoke("remote:editList"),
    editSyncNow: (request) => ipcRenderer.invoke("remote:editSyncNow", request),
    editRevealLocal: (request) => ipcRenderer.invoke("remote:editRevealLocal", request),
    editRedownload: (request) => ipcRenderer.invoke("remote:editRedownload", request),
    editForceUpload: (request) => ipcRenderer.invoke("remote:editForceUpload", request),
    editDownloadConflictCopy: (request) => ipcRenderer.invoke("remote:editDownloadConflictCopy", request),
    editCopyConflictPaths: (request) => ipcRenderer.invoke("remote:editCopyConflictPaths", request),
    editClose: (request) => ipcRenderer.invoke("remote:editClose", request),
    onEditUpdate: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload as Parameters<typeof handler>[0]);
      ipcRenderer.on("remote:editUpdate", wrapped);
      return () => ipcRenderer.off("remote:editUpdate", wrapped);
    }
  },
  transfer: {
    checkUploadConflicts: (request) => ipcRenderer.invoke("transfer:checkUploadConflicts", request),
    checkDownloadConflicts: (request) => ipcRenderer.invoke("transfer:checkDownloadConflicts", request),
    enqueueUpload: (request) => ipcRenderer.invoke("transfer:enqueueUpload", request),
    enqueueDownload: (request) => ipcRenderer.invoke("transfer:enqueueDownload", request),
    enqueueDelete: (request) => ipcRenderer.invoke("transfer:enqueueDelete", request),
    enqueueGzip: (request) => ipcRenderer.invoke("transfer:enqueueGzip", request),
    enqueueDecompress: (request) => ipcRenderer.invoke("transfer:enqueueDecompress", request),
    enqueueMd5: (request) => ipcRenderer.invoke("transfer:enqueueMd5", request),
    enqueueRemoteCopy: (request) => ipcRenderer.invoke("transfer:enqueueRemoteCopy", request),
    enqueueRemoteMove: (request) => ipcRenderer.invoke("transfer:enqueueRemoteMove", request),
    cancel: (request) => ipcRenderer.invoke("transfer:cancel", request),
    stop: (request) => ipcRenderer.invoke("transfer:stop", request),
    retry: (request) => ipcRenderer.invoke("transfer:retry", request),
    retryFailed: () => ipcRenderer.invoke("transfer:retryFailed"),
    list: () => ipcRenderer.invoke("transfer:list"),
    clearCompleted: () => ipcRenderer.invoke("transfer:clearCompleted"),
    onUpdate: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) =>
        handler(payload as Parameters<typeof handler>[0]);
      ipcRenderer.on("transfer:onUpdate", wrapped);
      return () => ipcRenderer.off("transfer:onUpdate", wrapped);
    }
  },
  content: {
    openWindow: (request) => ipcRenderer.invoke("content:openWindow", request),
    onOpenRequest: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload as Parameters<typeof handler>[0]);
      ipcRenderer.on("content:openRequest", wrapped);
      return () => ipcRenderer.off("content:openRequest", wrapped);
    }
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (request) => ipcRenderer.invoke("settings:set", request)
  },
  localFavorites: {
    list: () => ipcRenderer.invoke("localFavorites:list"),
    add: (request) => ipcRenderer.invoke("localFavorites:add", request),
    remove: (request) => ipcRenderer.invoke("localFavorites:remove", request),
    rename: (request) => ipcRenderer.invoke("localFavorites:rename", request),
    reorder: (request) => ipcRenderer.invoke("localFavorites:reorder", request),
    resetDefaults: () => ipcRenderer.invoke("localFavorites:resetDefaults")
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    save: (request) => ipcRenderer.invoke("profiles:save", request),
    update: (request) => ipcRenderer.invoke("profiles:update", request),
    delete: (request) => ipcRenderer.invoke("profiles:delete", request),
    addRemoteFavorite: (request) => ipcRenderer.invoke("profiles:addRemoteFavorite", request),
    removeRemoteFavorite: (request) => ipcRenderer.invoke("profiles:removeRemoteFavorite", request),
    renameRemoteFavorite: (request) => ipcRenderer.invoke("profiles:renameRemoteFavorite", request),
    reorderRemoteFavorite: (request) => ipcRenderer.invoke("profiles:reorderRemoteFavorite", request)
  },
  credentials: {
    isAvailable: () => ipcRenderer.invoke("credentials:isAvailable")
  },
  system: {
    copyText: (request) => ipcRenderer.invoke("system:copyText", request),
    quickLook: (request) => ipcRenderer.invoke("system:quickLook", request),
    openTerminal: (request) => ipcRenderer.invoke("system:openTerminal", request),
    openSshTerminal: (request) => ipcRenderer.invoke("system:openSshTerminal", request),
    getAppVersion: () => ipcRenderer.invoke("system:getAppVersion"),
    openLogFolder: () => ipcRenderer.invoke("system:openLogFolder"),
    openLogFile: () => ipcRenderer.invoke("system:openLogFile"),
    copyDiagnostics: () => ipcRenderer.invoke("system:copyDiagnostics"),
    checkForUpdates: () => ipcRenderer.invoke("system:checkForUpdates"),
    onOpenPreferences: (handler) => {
      const wrapped = () => handler();
      ipcRenderer.on("system:openPreferences", wrapped);
      return () => ipcRenderer.off("system:openPreferences", wrapped);
    },
    onSetPaneViewMode: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload as Parameters<typeof handler>[0]);
      ipcRenderer.on("system:setPaneViewMode", wrapped);
      return () => ipcRenderer.off("system:setPaneViewMode", wrapped);
    },
    onTogglePaneGroupByType: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload as Parameters<typeof handler>[0]);
      ipcRenderer.on("system:togglePaneGroupByType", wrapped);
      return () => ipcRenderer.off("system:togglePaneGroupByType", wrapped);
    },
    onSystemResume: (handler) => {
      const wrapped = () => handler();
      ipcRenderer.on("system:resume", wrapped);
      return () => ipcRenderer.off("system:resume", wrapped);
    }
  }
};

contextBridge.exposeInMainWorld("cofinder", api);
