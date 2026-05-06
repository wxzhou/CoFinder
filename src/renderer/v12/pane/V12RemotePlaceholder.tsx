import type { ReactElement } from "react";
import "./v12-pane.css";

export type V12RemotePlaceholderProps = {
  connecting: boolean;
  errorMessage: string;
  onConnect: () => void;
  connectDisabled: boolean;
};

export function V12RemotePlaceholder(props: V12RemotePlaceholderProps): ReactElement {
  return (
    <div className="cfv12p-disc">
      <h3 className="cfv12p-disc-title">Not connected</h3>
      <p className="cfv12p-disc-sub">Connect to a server to browse remote files. Site Manager opens in a window until the embedded flow ships.</p>
      <button type="button" className="cfv12p-disc-btn" disabled={props.connectDisabled} onClick={props.onConnect}>
        Connect…
      </button>
      {props.connecting ? <p className="cfv12p-disc-hint">Connecting…</p> : null}
      {props.errorMessage ? <p className="cfv12p-disc-hint">{props.errorMessage}</p> : null}
    </div>
  );
}
