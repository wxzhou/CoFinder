/**
 * Renderer entry routing for V1.1 vs V1.2 shell vs static mockup.
 * Pure functions for testability (no direct import.meta in core logic).
 */

export type RendererUiMode = "v11" | "shell-v12" | "mockup-v12";

export type RendererUiModeInput = {
  /** `window.location.search` style, e.g. `?ui=v12&foo=1` */
  search: string;
  /** When true, `mockup=v12` is allowed (dev-only static mockup). */
  isDev: boolean;
};

/**
 * `mockup=v12` wins in dev only (static high-fidelity mockup).
 * `ui=v12` selects the production V1.2 shell (M1+); allowed in any build when query is present.
 */
export function getRendererUiMode(input: RendererUiModeInput): RendererUiMode {
  const q = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  if (input.isDev && q.get("mockup") === "v12") {
    return "mockup-v12";
  }
  if (q.get("ui") === "v12") {
    return "shell-v12";
  }
  return "v11";
}
