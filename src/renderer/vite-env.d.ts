/// <reference types="vite/client" />

import type { IpcApi } from "../shared/types/ipc";

declare global {
  interface Window {
    cofinder: IpcApi;
  }
}

export {};
