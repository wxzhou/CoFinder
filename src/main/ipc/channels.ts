export const IPC_CHANNELS = {
  local: {
    listDirectory: "local:listDirectory",
    openPath: "local:openPath",
    revealPath: "local:revealPath",
    getHomePath: "local:getHomePath",
    rename: "local:rename",
    delete: "local:delete",
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
    previewOpen: "remote:previewOpen",
    previewClearForTab: "remote:previewClearForTab",
    previewClearForConnection: "remote:previewClearForConnection"
  },
  transfer: {
    enqueueUpload: "transfer:enqueueUpload",
    enqueueDownload: "transfer:enqueueDownload",
    cancel: "transfer:cancel",
    stop: "transfer:stop",
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
    getAppVersion: "system:getAppVersion"
  }
} as const;
