import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ContentViewerApp } from "./ContentViewerApp";
import { V12UiMockup } from "./mockups/V12UiMockup";
import { getRendererUiMode } from "./uiMode";
import { cofinder } from "./cofinderBridge";
import "./styles.css";

// Install the Tauri bridge as `window.cofinder` before the app renders.
// `window.cofinder` is typed via vite-env.d.ts (Window.cofinder: IpcApi).
declare global {
  interface Window {
    cofinder: typeof cofinder;
  }
}
if (!window.cofinder) {
  (window as unknown as { cofinder: typeof cofinder }).cofinder = cofinder;
}

const uiMode = getRendererUiMode({
  search: window.location.search,
  isDev: import.meta.env.DEV,
  viteLegacyUi: import.meta.env.VITE_COFINDER_LEGACY_UI === "1"
});
const searchParams = new URLSearchParams(window.location.search);
const isContentWindow = searchParams.get("mode") === "content" || window.__COFINDER_CONTENT__ === true;

const root = (
  <React.StrictMode>
    {isContentWindow ? (
      <ContentViewerApp />
    ) : uiMode === "mockup-v12" ? (
      <V12UiMockup />
    ) : uiMode === "shell-v12" ? (
      <App uiShell="v12" />
    ) : (
      <App uiShell="v11" />
    )}
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root")!).render(root);
