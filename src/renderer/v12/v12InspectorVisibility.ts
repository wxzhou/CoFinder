/**
 * M3: Inspector column is shown only when the user has a non-empty selection
 * in that pane (e.g. clicked a row). No selection → column hidden; list uses full width.
 */

export function inspectorColumnVisible(pane: "local" | "remote", selectedCount: number, remoteConnected: boolean): boolean {
  if (selectedCount === 0) return false;
  if (pane === "remote" && !remoteConnected) return false;
  return true;
}
