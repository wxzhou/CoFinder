import type { TransferTask } from "../../shared/types/models";

/** Compact secondary line for v12 transfer drawer (uses only fields present on TransferTask). */
export function formatTransferTaskMetaLine(task: TransferTask): string {
  if (task.status === "failed") {
    const errorParts = [task.errorCode, task.error].filter(Boolean);
    if (errorParts.length > 0) return errorParts.join(" · ");
  }
  const parts: string[] = [];
  if (task.percent != null && Number.isFinite(task.percent)) {
    parts.push(`${Math.round(task.percent)}%`);
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
