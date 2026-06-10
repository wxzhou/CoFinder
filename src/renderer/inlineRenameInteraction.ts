export function shouldCommitInlineRenameFromPaneBackground(args: {
  hasInlineRename: boolean;
  mouseButton: number;
  targetIsInteractive: boolean;
}): boolean {
  return args.hasInlineRename && args.mouseButton === 0 && !args.targetIsInteractive;
}
