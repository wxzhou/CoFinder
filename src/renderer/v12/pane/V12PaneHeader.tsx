import type { ReactElement, ReactNode } from "react";
import "./v12-pane.css";

export type V12PaneHeaderProps = {
  title: string;
  tabTitle: string;
  pathLine: string;
  endSlot?: ReactNode;
};

export function V12PaneHeader(props: V12PaneHeaderProps): ReactElement {
  const line = props.pathLine?.trim() ? props.pathLine : "—";
  return (
    <div className="cfv12p-pane-chrome">
      <div className="cfv12p-head-row">
        <div className="cfv12p-head-titles">
          <div className="cfv12p-head-title">{props.title}</div>
          <div className="cfv12p-head-meta">
            {props.tabTitle} · {line}
          </div>
        </div>
        {props.endSlot ? <div className="cfv12p-head-actions">{props.endSlot}</div> : null}
      </div>
    </div>
  );
}
