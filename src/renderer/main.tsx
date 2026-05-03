import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { V12UiMockup } from "./mockups/V12UiMockup";
import "./styles.css";

const showV12Mockup = import.meta.env.DEV && new URLSearchParams(window.location.search).get("mockup") === "v12";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{showV12Mockup ? <V12UiMockup /> : <App />}</React.StrictMode>
);
