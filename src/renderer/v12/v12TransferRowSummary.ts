import type { TransferTask } from "../../shared/types/models";

/** Compact secondary line for v12 transfer drawer (uses only fields present on TransferTask). */
export function formatTransferTaskMetaLine(task: TransferTask): string {
  if (task.status === "failed") {
    const errorParts = [task.errorCode, task.error].filter(Boolean);
    if (errorParts.length > 0) return errorParts.join(" · ");
  }
  const parts: string[] = [];
  if (task.itemTotalCount) {
    parts.push(`Folder ${task.itemDoneCount ?? 0}/${task.itemTotalCount} files`);
    if (task.currentFile?.trim()) parts.push(`Current ${task.currentFile.trim()}`);
    if (task.percent != null && Number.isFinite(task.percent)) parts.push(`Current ${Math.round(task.percent)}%`);
    if (task.speed?.trim()) parts.push(task.speed.trim());
    if (task.eta?.trim()) parts.push(`ETA ${task.eta.trim()}`);
    return parts.join(" · ") || "—";
  }
  if (task.percent != null && Number.isFinite(task.percent)) {
    const rounded = `${Math.round(task.percent)}%`;
    if (!task.progressText?.includes(rounded)) parts.push(rounded);
  }
  if (task.progressText?.trim()) {
    parts.push(task.progressText.trim());
  } else if (task.currentFile?.trim()) {
    parts.push(task.currentFile.trim());
  }
  if (task.speed?.trim()) {
    parts.push(task.speed.trim());
  }
  if (task.eta?.trim()) {
    parts.push(`ETA ${task.eta.trim()}`);
  }
  return parts.join(" · ") || "—";
}
