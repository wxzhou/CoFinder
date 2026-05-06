import type { ReactElement } from "react";
import "./v12-pane.css";

export type V12PaneStatusProps = {
  selectedCount: number;
  totalCount: number;
  selectedSizeLabel: string;
  totalSizeLabel: string;
};

export function V12PaneStatus(props: V12PaneStatusProps): ReactElement {
  return (
    <footer className="cfv12p-status" aria-label="Selection summary">
      <span>{props.selectedCount} selected</span>
      <span>{props.totalCount} items</span>
      <span>Selection size {props.selectedSizeLabel}</span>
      <span>Total size {props.totalSizeLabel}</span>
    </footer>
  );
}
