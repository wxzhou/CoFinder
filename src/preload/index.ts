import { contextBridge, ipcRenderer } from "electron";
import type { IpcApi } from "../shared/types/ipc";

const api: IpcApi = {
  local: {
    listDirectory: (request) => ipcRenderer.invoke("local:listDirectory", request),
    openPath: (request) => ipcRenderer.invoke("local:openPath", request)
  },
  remote: {
    connect: (request) => ipcRenderer.invoke("remote:connect", request),
    listDirectory: (request) => ipcRenderer.invoke("remote:listDirectory", request),
    disconnect: (request) => ipcRenderer.invoke("remote:disconnect", request),
    getHomeDirectory: (request) => ipcRenderer.invoke("remote:getHomeDirectory", request)
  },
  transfer: {
    enqueueUpload: (request) => ipcRenderer.invoke("transfer:enqueueUpload", request),
    enqueueDownload: (request) => ipcRenderer.invoke("transfer:enqueueDownload", request),
    cancel: (request) => ipcRenderer.invoke("transfer:cancel", request),
    onUpdate: (handler) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
      ipcRenderer.on("transfer:onUpdate", wrapped);
      return () => ipcRenderer.off("transfer:onUpdate", wrapped);
    }
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (request) => ipcRenderer.invoke("settings:set", request)
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    save: (request) => ipcRenderer.invoke("profiles:save", request),
    update: (request) => ipcRenderer.invoke("profiles:update", request),
    delete: (request) => ipcRenderer.invoke("profiles:delete", request)
  },
  credentials: {
    isAvailable: () => ipcRenderer.invoke("credentials:isAvailable")
  }
};

contextBridge.exposeInMainWorld("cofinder", api);
