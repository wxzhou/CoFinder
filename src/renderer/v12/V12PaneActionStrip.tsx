import type { ReactElement } from "react";
import { V12TbIcon } from "./shared/V12Icons";

type Action = {
  label: string;
  title: string;
  icon: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
};

export type V12PaneActionStripProps = {
  label: string;
  actions: Action[];
};

export function V12PaneActionStrip(props: V12PaneActionStripProps): ReactElement {
  return (
    <div className="v12m-pane-actions" role="toolbar" aria-label={props.label}>
      {props.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`v12m-pane-action${action.danger ? " is-danger" : ""}`}
          title={action.title}
          aria-label={action.label}
          disabled={action.disabled}
          onClick={() => action.onClick()}
        >
          <V12TbIcon name={action.icon} />
        </button>
      ))}
    </div>
  );
}
