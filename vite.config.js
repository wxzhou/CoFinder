import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    // Required for Electron loadFile(file://...): absolute /assets/... would 404 outside the asar.
    base: "./",
    plugins: [react()]
});
