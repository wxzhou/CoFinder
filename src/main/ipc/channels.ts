export const IPC_CHANNELS = {
  local: {
    listDirectory: "local:listDirectory",
    openPath: "local:openPath"
  },
  remote: {
    connect: "remote:connect",
    listDirectory: "remote:listDirectory",
    disconnect: "remote:disconnect",
    getHomeDirectory: "remote:getHomeDirectory"
  },
  transfer: {
    enqueueUpload: "transfer:enqueueUpload",
    enqueueDownload: "transfer:enqueueDownload",
    cancel: "transfer:cancel",
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
  }
} as const;
