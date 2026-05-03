import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { V12UiMockup } from "./mockups/V12UiMockup";
import { getRendererUiMode } from "./uiMode";
import "./styles.css";

const uiMode = getRendererUiMode({ search: window.location.search, isDev: import.meta.env.DEV });

const root = (
  <React.StrictMode>
    {uiMode === "mockup-v12" ? (
      <V12UiMockup />
    ) : uiMode === "shell-v12" ? (
      <App uiShell="v12" />
    ) : (
      <App />
    )}
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root")!).render(root);
