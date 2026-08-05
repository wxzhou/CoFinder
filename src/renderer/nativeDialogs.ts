/**
 * Native dialog helpers for CoFinder's renderer.
 *
 * WKWebView (wry, Tauri) does not implement `window.confirm` / `window.alert`,
 * so those calls would silently no-op. These helpers route confirm/alert to
 * native macOS dialogs via Tauri commands when running under Tauri, and fall
 * back to the browser-native dialogs otherwise (Electron dev / plain browser).
 */
import { invoke } from "@tauri-apps/api/core";

const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function confirmDialog(message: string): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>("native_confirm", { message, title: "CoFinder" });
    } catch {
      return window.confirm(message);
    }
  }
  return window.confirm(message);
}

export async function alertDialog(message: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke<void>("native_alert", { message, title: "CoFinder" });
      return;
    } catch {
      window.alert(message);
      return;
    }
  }
  window.alert(message);
}
