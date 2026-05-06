import type { ReactElement, ReactNode } from "react";
import "./v12-pane.css";

export function V12PaneShell(props: { isFocused: boolean; children: ReactNode }): ReactElement {
  return <div className={`cfv12p-pane ${props.isFocused ? "is-focus" : "is-blur"}`}>{props.children}</div>;
}
