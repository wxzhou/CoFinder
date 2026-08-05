/// <reference types="vite/client" />

import type { IpcApi } from "../shared/types/ipc";

interface ImportMetaEnv {
  /** When `"1"`, renderer boots classic V1.1 shell (compile-time). Use `COFINDER_LEGACY_UI=1` in main for packaged/runtime. */
  readonly VITE_COFINDER_LEGACY_UI?: string;
}

declare global {
  interface Window {
    cofinder: IpcApi;
    /** Set by the Tauri host when loading the content-viewer webview. */
    __COFINDER_CONTENT__?: boolean;
  }
}

export {};
