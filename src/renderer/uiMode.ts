/**
 * Renderer entry routing for V1.1 vs V1.2 shell vs static mockup.
 * Pure functions for testability (no direct import.meta in core logic).
 */

export type RendererUiMode = "v11" | "shell-v12" | "mockup-v12";

export type RendererUiModeInput = {
  /** `window.location.search` style, e.g. `?ui=v11&foo=1` */
  search: string;
  /** When true, `mockup=v12` is allowed (dev-only static mockup). */
  isDev: boolean;
  /** True when `VITE_COFINDER_LEGACY_UI=1` at build time (classic UI). */
  viteLegacyUi?: boolean;
};

/**
 * Default is V1.2 production shell (`shell-v12`).
 *
 * - `mockup=v12` wins in dev only (static high-fidelity mockup).
 * - Legacy classic UI: `ui=v11`, `legacy=1`, or build-time `viteLegacyUi`.
 * - `ui=v12` remains an explicit alias for the default shell (bookmarks / parity checks).
 */
export function getRendererUiMode(input: RendererUiModeInput): RendererUiMode {
  const q = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  if (input.isDev && q.get("mockup") === "v12") {
    return "mockup-v12";
  }
  if (q.get("ui") === "v12") {
    return "shell-v12";
  }
  if (q.get("ui") === "v11" || q.get("legacy") === "1") {
    return "v11";
  }
  if (input.viteLegacyUi) {
    return "v11";
  }
  return "shell-v12";
}
