export type TransferDropPane = "local" | "remote";

export type TransferDropPayload = {
  pane: TransferDropPane;
  tabId: string;
};

export function resolveRowTransferDropTarget(args: {
  targetPane: TransferDropPane;
  activeTabId: string;
  payload: TransferDropPayload | null;
  hasFinderFiles: boolean;
  entryType: string;
  entryPath: string;
  currentPath: string;
}): string | null {
  const sameTab = args.payload?.tabId === args.activeTabId;
  const crossPane =
    (args.targetPane === "remote" && args.payload?.pane === "local" && sameTab) ||
    (args.targetPane === "local" && args.payload?.pane === "remote" && sameTab);
  const finderUpload = args.targetPane === "remote" && args.hasFinderFiles;
  if (!crossPane && !finderUpload) return null;
  return args.entryType === "directory" ? args.entryPath : args.currentPath;
}
