import type { ReactElement, ReactNode } from "react";
import { V12TbIcon } from "./shared/V12Icons";

export type V12PaneToolbarAction = {
  label: string;
  title: string;
  icon: string;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
};

export type V12PaneToolbarProps = {
  label: string;
  actions: V12PaneToolbarAction[];
  children: ReactNode;
};

export function V12PaneToolbar(props: V12PaneToolbarProps): ReactElement {
  return (
    <div className="v12m-pane-toolbar" role="toolbar" aria-label={props.label}>
      <div className="v12m-pane-toolbar-actions" aria-label={`${props.label} actions`}>
        {props.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`v12m-pane-action${action.danger ? " is-danger" : ""}${action.pressed ? " is-pressed" : ""}`}
            title={action.title}
            aria-label={action.label}
            aria-pressed={action.pressed}
            disabled={action.disabled}
            onClick={() => action.onClick()}
          >
            <V12TbIcon name={action.icon} />
          </button>
        ))}
      </div>
      <div className="v12m-pane-toolbar-controls">{props.children}</div>
    </div>
  );
}
