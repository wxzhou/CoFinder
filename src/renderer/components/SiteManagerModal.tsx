import type { ProfileUpsertPayload } from "../../shared/types/ipc";
import type { ServerProfile } from "../../shared/types/models";
import { profilePrimaryLabel } from "../profilePrimaryLabel";

export { profilePrimaryLabel } from "../profilePrimaryLabel";

type Props = {
  open: boolean;
  profiles: ServerProfile[];
  draft: ProfileUpsertPayload;
  passwordDirty: boolean;
  listError: string;
  modalError: string;
  busy: "idle" | "load" | "save" | "login" | "delete";
  credentialAvailable: boolean;
  selectedProfileId: string | null;
  onClose: () => void;
  onSelectProfile: (profile: ServerProfile) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSave: () => void;
  onLogin: () => void;
  onDraftPatch: (patch: Partial<ProfileUpsertPayload>) => void;
  onPasswordChange: (value: string) => void;
};

export function SiteManagerModal(props: Props) {
  if (!props.open) return null;

  const selectedHasStored =
    props.draft.id && props.profiles.find((p) => p.id === props.draft.id)?.hasSavedPassword === true;
  const passwordPlaceholder =
    selectedHasStored && !props.passwordDirty ? "Saved in secure storage" : props.credentialAvailable ? "" : "";

  const disableForm = props.busy === "login" || props.busy === "save" || props.busy === "delete" || props.busy === "load";
  const savePasswordDisabled = !props.credentialAvailable;

  return (
    <div className="site-manager-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="site-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="site-manager-title">
        <div className="site-manager-head">
          <h2 id="site-manager-title" className="site-manager-title">
            Site Manager
          </h2>
          <button type="button" className="site-manager-close nav-btn" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </div>

        <div className="site-manager-body">
          <aside className="site-manager-sites">
            <div className="site-manager-sites-toolbar">
              <button type="button" className="toolbar-button" disabled={disableForm} onClick={props.onNew}>
                New
              </button>
              <button type="button" className="toolbar-button" disabled={disableForm || !props.draft.id} onClick={props.onDuplicate}>
                Duplicate
              </button>
              <button type="button" className="toolbar-button" disabled={disableForm || !props.draft.id} onClick={props.onDelete}>
                Delete
              </button>
            </div>
            {props.listError ? <div className="error-banner site-manager-list-error">{props.listError}</div> : null}
            <ul className="site-manager-list">
              {props.profiles.length === 0 && !props.listError ? (
                <li className="site-manager-empty">No saved sites</li>
              ) : (
                props.profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`site-manager-list-item ${props.selectedProfileId === p.id ? "is-selected" : ""}`}
                      onClick={() => props.onSelectProfile(p)}
                    >
                      <span className="site-manager-list-primary">{profilePrimaryLabel(p)}</span>
                      {p.defaultRemotePath ? (
                        <span className="site-manager-list-secondary" title={p.defaultRemotePath}>
                          {p.defaultRemotePath}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>

          <section className="site-manager-form-panel">
            {props.modalError ? <div className="error-banner">{props.modalError}</div> : null}

            <div className="site-manager-grid">
              <label>
                Alias
                <input
                  value={props.draft.alias}
                  disabled={disableForm}
                  onChange={(e) => props.onDraftPatch({ alias: e.target.value })}
                />
              </label>
              <label>
                Host *
                <input
                  value={props.draft.host}
                  disabled={disableForm}
                  onChange={(e) => props.onDraftPatch({ host: e.target.value })}
                />
              </label>
              <label>
                Port *
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={props.draft.port}
                  disabled={disableForm}
                  onChange={(e) => props.onDraftPatch({ port: Number(e.target.value) || 0 })}
                />
              </label>
              <label>
                Username *
                <input
                  value={props.draft.username}
                  disabled={disableForm}
                  onChange={(e) => props.onDraftPatch({ username: e.target.value })}
                />
              </label>
              <label className="site-manager-span-2">
                Authentication type
                <select
                  value={props.draft.authType}
                  disabled={disableForm}
                  onChange={(e) => props.onDraftPatch({ authType: e.target.value as ProfileUpsertPayload["authType"] })}
                >
                  <option value="password">Password</option>
                  <option value="privateKey" disabled>
                    Private key (not yet supported)
                  </option>
                </select>
              </label>
              <label className="site-manager-span-2">
                Password
                <input
                  type="password"
                  autoComplete="off"
                  disabled={disableForm || props.draft.authType !== "password"}
                  placeholder={passwordPlaceholder}
                  value={props.draft.password ?? ""}
                  onChange={(e) => props.onPasswordChange(e.target.value)}
                />
              </label>
              <label className="checkbox-row site-manager-span-2">
                <input
                  type="checkbox"
                  checked={props.draft.savePassword}
                  disabled={disableForm || savePasswordDisabled}
                  onChange={(e) => props.onDraftPatch({ savePassword: e.target.checked })}
                />
                Save password
              </label>
              {savePasswordDisabled ? (
                <p className="site-manager-hint site-manager-span-2">
                  Password saving is unavailable because system secure storage is not enabled for this app.
                </p>
              ) : null}
              <label className="site-manager-span-2">
                Initial remote path
                <input
                  value={props.draft.defaultRemotePath ?? ""}
                  disabled={disableForm}
                  onChange={(e) => props.onDraftPatch({ defaultRemotePath: e.target.value })}
                />
              </label>
            </div>

            <div className="site-manager-actions">
              <button type="button" className="toolbar-button" disabled={disableForm} onClick={props.onSave}>
                {props.busy === "save" ? "Saving…" : "Save"}
              </button>
              <button type="button" className="toolbar-button" disabled={disableForm} onClick={props.onLogin}>
                {props.busy === "login" ? "Connecting…" : "Login"}
              </button>
              <button type="button" className="toolbar-button" disabled={disableForm} onClick={props.onClose}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
