import type { ReactElement } from "react";

export type V12RemoteDisconnectedBodyProps = {
  connecting: boolean;
  errorMessage: string;
  onConnect: () => void;
  connectDisabled: boolean;
};

/** Same structure as mockup `RemoteDisconnected` — `v12m-state-disc`. */
export function V12RemoteDisconnectedBody(props: V12RemoteDisconnectedBodyProps): ReactElement {
  return (
    <div className="v12m-state-disc">
      <p className="v12m-state-title">Not connected</p>
      <p className="v12m-state-sub">Connect to browse this site.</p>
      <button type="button" className="v12m-cta" disabled={props.connectDisabled} onClick={props.onConnect}>
        Connect
      </button>
      {props.connecting ? <p className="v12m-state-sub">Connecting…</p> : null}
      {props.errorMessage ? <p className="v12m-state-sub">{props.errorMessage}</p> : null}
    </div>
  );
}
