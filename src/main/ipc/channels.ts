export const IPC_CHANNELS = {
  local: {
    listDirectory: "local:listDirectory",
    openPath: "local:openPath",
    revealPath: "local:revealPath",
    getHomePath: "local:getHomePath",
    rename: "local:rename",
    delete: "local:delete",
    mkdir: "local:mkdir",
    createTextFile: "local:createTextFile",
    getInfo: "local:getInfo"
  },
  remote: {
    connect: "remote:connect",
    listDirectory: "remote:listDirectory",
    disconnect: "remote:disconnect",
    getHomeDirectory: "remote:getHomeDirectory",
    rename: "remote:rename",
    delete: "remote:delete",
    getInfo: "remote:getInfo",
    mkdir: "remote:mkdir",
    createTextFile: "remote:createTextFile",
    chmod: "remote:chmod",
    duplicate: "remote:duplicate",
    directorySizeStart: "remote:directorySizeStart",
    directorySizeCancel: "remote:directorySizeCancel",
    directorySizeUpdate: "remote:directorySizeUpdate",
    previewOpen: "remote:previewOpen",
    previewClearForTab: "remote:previewClearForTab",
    previewClearForConnection: "remote:previewClearForConnection",
    editOpen: "remote:editOpen",
    editList: "remote:editList"
  },
  transfer: {
    checkUploadConflicts: "transfer:checkUploadConflicts",
    checkDownloadConflicts: "transfer:checkDownloadConflicts",
    enqueueUpload: "transfer:enqueueUpload",
    enqueueDownload: "transfer:enqueueDownload",
    cancel: "transfer:cancel",
    stop: "transfer:stop",
    retry: "transfer:retry",
    retryFailed: "transfer:retryFailed",
    list: "transfer:list",
    clearCompleted: "transfer:clearCompleted",
    onUpdate: "transfer:onUpdate"
  },
  settings: {
    get: "settings:get",
    set: "settings:set"
  },
  localFavorites: {
    list: "localFavorites:list",
    add: "localFavorites:add",
    remove: "localFavorites:remove",
    rename: "localFavorites:rename",
    reorder: "localFavorites:reorder",
    resetDefaults: "localFavorites:resetDefaults"
  },
  profiles: {
    list: "profiles:list",
    save: "profiles:save",
    update: "profiles:update",
    delete: "profiles:delete",
    addRemoteFavorite: "profiles:addRemoteFavorite",
    removeRemoteFavorite: "profiles:removeRemoteFavorite",
    renameRemoteFavorite: "profiles:renameRemoteFavorite",
    reorderRemoteFavorite: "profiles:reorderRemoteFavorite"
  },
  credentials: {
    isAvailable: "credentials:isAvailable"
  },
  system: {
    copyText: "system:copyText",
    quickLook: "system:quickLook",
    openTerminal: "system:openTerminal",
    openSshTerminal: "system:openSshTerminal",
    getAppVersion: "system:getAppVersion",
    openLogFolder: "system:openLogFolder",
    openLogFile: "system:openLogFile",
    copyDiagnostics: "system:copyDiagnostics",
    checkForUpdates: "system:checkForUpdates"
  }
} as const;
