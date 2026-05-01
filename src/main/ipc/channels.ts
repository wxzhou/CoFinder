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
    getInfo: "remote:getInfo"
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
  profiles: {
    list: "profiles:list",
    save: "profiles:save",
    update: "profiles:update",
    delete: "profiles:delete"
  },
  credentials: {
    isAvailable: "credentials:isAvailable"
  },
  system: {
    copyText: "system:copyText",
    quickLook: "system:quickLook"
  }
} as const;
