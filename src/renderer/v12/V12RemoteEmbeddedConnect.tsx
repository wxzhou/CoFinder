import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { ProfileUpsertPayload } from "../../shared/types/ipc";
import type { ServerProfile } from "../../shared/types/models";
import { validateEmbeddedRemoteConnectInput } from "../embeddedRemoteConnect";
import { profilePrimaryLabel } from "../profilePrimaryLabel";

export type RemoteConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

export type V12EmbeddedRemoteConnectSubmit = {
  profileId: string | null;
  profileSavePayload: ProfileUpsertPayload | null;
  savePasswordWithTyped: boolean;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  privateKeyPath?: string;
  passwordTyped: string;
  hasStoredPassword: boolean;
  defaultRemotePathTrimmed: string | undefined;
  aliasForTitle: string;
};

export type V12RemoteEmbeddedConnectProps = {
  profiles: ServerProfile[];
  listError: string;
  credentialAvailable: boolean;
  connectionStatus: RemoteConnectionStatus;
  paneError: string;
  /** M2.7 handoff: select this profile once when profiles load, then parent clears */
  initialProfileId?: string | null;
  onInitialProfileConsumed?: () => void;
  onOpenSiteManager: () => void;
  onReloadProfiles: () => void;
  onConnect: (payload: V12EmbeddedRemoteConnectSubmit) => void | Promise<void>;
};

function emptyQuickDraft(): ProfileUpsertPayload {
  return {
    alias: "",
    host: "",
    port: 22,
    username: "",
    defaultRemotePath: "",
    authType: "password",
    privateKeyPath: "",
    password: "",
    savePassword: false
  };
}

function profileToEmbeddedDraft(profile: ServerProfile): ProfileUpsertPayload {
  return {
    id: profile.id,
    alias: profile.alias,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    defaultRemotePath: profile.defaultRemotePath ?? "",
    authType: profile.authType,
    privateKeyPath: profile.privateKeyPath ?? "",
    password: "",
    savePassword: !!profile.hasSavedPassword
  };
}

export function V12RemoteEmbeddedConnect(props: V12RemoteEmbeddedConnectProps): ReactElement {
  const [draft, setDraft] = useState<ProfileUpsertPayload>(() => emptyQuickDraft());
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [localError, setLocalError] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);

  const selectedProfile = draft.id ? props.profiles.find((p) => p.id === draft.id) : undefined;
  const selectedHasStored = !!selectedProfile?.hasSavedPassword;
  const passwordPlaceholder =
    selectedHasStored && !passwordDirty ? "Saved in secure storage" : props.credentialAvailable ? "" : "";
  const savePasswordDisabled = !props.credentialAvailable;
  const connecting = props.connectionStatus === "connecting" || submitBusy;
  const showPaneError = props.connectionStatus === "failed" && props.paneError.trim();

  useEffect(() => {
    const id = props.initialProfileId;
    if (!id || props.profiles.length === 0) return;
    const p = props.profiles.find((x) => x.id === id);
    if (!p) return;
    setDraft(profileToEmbeddedDraft(p));
    setPasswordDirty(false);
    setLocalError("");
    props.onInitialProfileConsumed?.();
  }, [props.initialProfileId, props.profiles]);

  function applyProfile(profile: ServerProfile): void {
    setDraft(profileToEmbeddedDraft(profile));
    setPasswordDirty(false);
    setLocalError("");
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (connecting) return;

    const host = draft.host.trim();
    const username = draft.username.trim();
    const port = draft.port;
    const pwd = (draft.password ?? "").trim();
    const hasStored = draft.id ? props.profiles.some((p) => p.id === draft.id && p.hasSavedPassword) : false;

    const v = validateEmbeddedRemoteConnectInput({
      authType: draft.authType,
      host,
      username,
      port,
      passwordTyped: pwd,
      hasStoredPassword: hasStored,
      privateKeyPath: draft.privateKeyPath
    });
    if (!v.ok) {
      setLocalError(v.message);
      return;
    }
    setLocalError("");

    const savePasswordWithTyped = !!(draft.savePassword && pwd);
    const profileSavePayload: ProfileUpsertPayload | null = savePasswordWithTyped
      ? {
          ...draft,
          host,
          username,
          port,
          password: pwd,
          savePassword: true,
          defaultRemotePath: draft.defaultRemotePath?.trim() || undefined
        }
      : null;

    const aliasForTitle = draft.alias.trim() || `${username}@${host}:${port}`;

    setSubmitBusy(true);
    try {
      await props.onConnect({
        profileId: draft.id ?? null,
        profileSavePayload,
        savePasswordWithTyped,
        host,
        port,
        username,
        authType: draft.authType,
        privateKeyPath: draft.privateKeyPath?.trim() || undefined,
        passwordTyped: pwd,
        hasStoredPassword: hasStored,
        defaultRemotePathTrimmed: draft.defaultRemotePath?.trim() || undefined,
        aliasForTitle
      });
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <div className="v12m-embedded-remote" aria-label="Remote connection">
      <div className="v12m-embedded-remote-head">
        <h2 className="v12m-embedded-remote-title">Connect</h2>
        <p className="v12m-embedded-remote-sub">Choose a saved site or enter server details.</p>
      </div>

      {props.listError ? <div className="cfv12p-error v12m-embedded-remote-banner">{props.listError}</div> : null}
      {localError ? <div className="cfv12p-error v12m-embedded-remote-banner">{localError}</div> : null}
      {showPaneError ? <div className="cfv12p-error v12m-embedded-remote-banner">{props.paneError}</div> : null}

      <div className="v12m-embedded-remote-grid">
        <aside className="v12m-embedded-remote-sites" aria-label="Saved sites">
          <div className="v12m-embedded-remote-sites-toolbar">
            <button type="button" className="v12m-insp-linkbtn" disabled={connecting} onClick={() => props.onReloadProfiles()}>
              Refresh list
            </button>
          </div>
          <ul className="v12m-embedded-remote-list">
            {props.profiles.length === 0 && !props.listError ? (
              <li className="v12m-embedded-remote-empty">No saved sites</li>
            ) : (
              props.profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`v12m-embedded-remote-list-item ${draft.id === p.id ? "is-selected" : ""}`}
                    disabled={connecting}
                    onClick={() => applyProfile(p)}
                  >
                    <span className="v12m-embedded-remote-list-primary">{profilePrimaryLabel(p)}</span>
                    {p.defaultRemotePath ? (
                      <span className="v12m-embedded-remote-list-secondary" title={p.defaultRemotePath}>
                        {p.defaultRemotePath}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <form className="v12m-embedded-remote-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="v12m-embedded-remote-fields">
            <label className="v12m-embedded-remote-label">
              <span>Host</span>
              <input
                value={draft.host}
                disabled={connecting}
                onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))}
                autoComplete="off"
              />
            </label>
            <label className="v12m-embedded-remote-label">
              <span>Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={draft.port}
                disabled={connecting}
                onChange={(e) => setDraft((d) => ({ ...d, port: Number(e.target.value) || 0 }))}
              />
            </label>
            <label className="v12m-embedded-remote-label v12m-embedded-remote-span2">
              <span>Username</span>
              <input
                value={draft.username}
                disabled={connecting}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                autoComplete="username"
              />
            </label>
            <label className="v12m-embedded-remote-label v12m-embedded-remote-span2">
              <span>Authentication</span>
              <select
                value={draft.authType}
                disabled={connecting}
                onChange={(e) => setDraft((d) => ({ ...d, authType: e.target.value as ProfileUpsertPayload["authType"] }))}
              >
                <option value="password">Password</option>
                <option value="privateKey">Private key</option>
              </select>
            </label>
            {draft.authType === "privateKey" ? (
              <label className="v12m-embedded-remote-label v12m-embedded-remote-span2">
                <span>Private key path</span>
                <input
                  type="text"
                  autoComplete="off"
                  disabled={connecting}
                  placeholder="/Users/me/.ssh/id_ed25519"
                  value={draft.privateKeyPath ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, privateKeyPath: e.target.value }))}
                />
              </label>
            ) : (
              <>
                <label className="v12m-embedded-remote-label v12m-embedded-remote-span2">
                  <span>Password</span>
                  <input
                    type="password"
                    autoComplete="off"
                    disabled={connecting || draft.authType !== "password"}
                    placeholder={passwordPlaceholder}
                    value={draft.password ?? ""}
                    onChange={(e) => {
                      setPasswordDirty(true);
                      setDraft((d) => ({ ...d, password: e.target.value }));
                    }}
                  />
                </label>
                <label className="v12m-embedded-remote-check v12m-embedded-remote-span2">
                  <input
                    type="checkbox"
                    checked={draft.savePassword}
                    disabled={connecting || savePasswordDisabled}
                    onChange={(e) => setDraft((d) => ({ ...d, savePassword: e.target.checked }))}
                  />
                  <span>Save password</span>
                </label>
                {savePasswordDisabled ? (
                  <p className="v12m-embedded-remote-hint v12m-embedded-remote-span2">
                    Password saving is unavailable because system secure storage is not enabled for this app.
                  </p>
                ) : null}
              </>
            )}
            <label className="v12m-embedded-remote-label v12m-embedded-remote-span2">
              <span>Initial remote path (optional)</span>
              <input
                value={draft.defaultRemotePath ?? ""}
                disabled={connecting}
                onChange={(e) => setDraft((d) => ({ ...d, defaultRemotePath: e.target.value }))}
              />
            </label>
          </div>

          <div className="v12m-embedded-remote-actions">
            <button type="submit" className="v12m-cta" disabled={connecting}>
              {connecting ? "Connecting…" : "Connect"}
            </button>
            <button type="button" className="v12m-insp-linkbtn" disabled={connecting} onClick={() => props.onOpenSiteManager()}>
              Open Site Manager…
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
