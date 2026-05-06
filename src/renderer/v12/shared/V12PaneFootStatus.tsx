import type { ReactElement } from "react";

export type V12PaneFootStatusProps = {
  selectedCount: number;
  totalCount: number;
  selectedSizeLabel: string;
  totalSizeLabel: string;
};

export function V12PaneFootStatus(props: V12PaneFootStatusProps): ReactElement {
  return (
    <footer className="v12m-pane-foot" aria-label="Selection summary">
      <span>{props.selectedCount} selected</span>
      <span>{props.totalCount} items</span>
      <span>{props.selectedSizeLabel} selected</span>
      <span>{props.totalSizeLabel} total</span>
    </footer>
  );
}
