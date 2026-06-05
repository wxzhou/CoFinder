import type { ReactElement } from "react";
import type { LocalFavoriteListItem } from "../../shared/localFavorites";
import { pickActiveFavoriteId } from "../../shared/localFavorites";
import type { RemoteFavorite } from "../../shared/types/models";
import { V12Icon, V12TbIcon } from "./shared/V12Icons";

export type V12LocalFavoritesSidebarProps = {
  favorites: LocalFavoriteListItem[];
  currentLocalPath: string;
  /** Short transient message (e.g. duplicate path, IPC error). */
  hint?: string;
  onSelectFavorite: (path: string) => void;
  onAddCurrentPath: () => void;
  onRemoveFavorite: (id: string) => void;
  onReorderFavorite: (id: string, direction: "up" | "down") => void;
  /** Restore Home / Desktop / Downloads / Documents after any were removed. */
  onRestoreDefaults: () => void;
  remoteFavorites: RemoteFavorite[];
  remoteConnected: boolean;
  currentRemotePath: string;
  onSelectRemoteFavorite: (path: string) => void;
  onAddCurrentRemotePath: () => void;
  onRemoveRemoteFavorite: (id: string) => void;
  onReorderRemoteFavorite: (id: string, direction: "up" | "down") => void;
  onOpenPreferences: () => void;
  onToggleSidebar: () => void;
};

export function V12LocalFavoritesSidebar(props: V12LocalFavoritesSidebarProps): ReactElement {
  const activeId = pickActiveFavoriteId(props.currentLocalPath, props.favorites);

  return (
    <aside className="v12m-sidebar cfv12-sidebar" aria-label="Sidebar">
      <div className="v12m-ssec">
        <div className="v12m-ssec-head">
          <h3>Local Favorites</h3>
          <button
            type="button"
            className="v12m-ssec-add"
            title="Add current folder"
            aria-label="Add current local folder to favorites"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.onAddCurrentPath();
            }}
          >
            +
          </button>
        </div>
        {props.hint ? <p className="v12m-ssec-hint v12m-ssec-hint--err">{props.hint}</p> : null}
        {props.favorites.map((f) => {
          const isActive = f.id === activeId;
          const rowClass = ["v12m-srow", isActive ? "on" : "", !f.pathExists ? "is-missing" : ""].filter(Boolean).join(" ");
          return (
            <div key={f.id} className={rowClass}>
              <button
                type="button"
                className="v12m-srow-main"
                title={f.pathExists ? f.path : `${f.path} (missing)`}
                onClick={() => props.onSelectFavorite(f.path)}
              >
                <span className="v12m-srow-ic" aria-hidden>
                  <V12Icon name="folder" />
                </span>
                <span className="v12m-srow-text">
                  <span className="v12m-srow-label">{f.label}</span>
                  <span className="v12m-srow-path">{f.path}</span>
                </span>
              </button>
              <button
                type="button"
                className="v12m-srow-del"
                title="Remove from favorites"
                aria-label={`Remove ${f.label} from favorites`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onRemoveFavorite(f.id);
                }}
              >
                ×
              </button>
              {!f.isDefault ? (
                <span className="v12m-srow-tools">
                  <button type="button" title="Move up" onClick={() => props.onReorderFavorite(f.id, "up")}>
                    ↑
                  </button>
                  <button type="button" title="Move down" onClick={() => props.onReorderFavorite(f.id, "down")}>
                    ↓
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="v12m-ssec-reset"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            props.onRestoreDefaults();
          }}
        >
          Restore default locations
        </button>
      </div>

      <div className="v12m-ssec v12m-ssec--remote-placeholder">
        <div className="v12m-ssec-head">
          <h3>Remote Favorites</h3>
          <button
            type="button"
            className="v12m-ssec-add"
            title="Add current remote folder"
            aria-label="Add current remote folder to favorites"
            disabled={!props.remoteConnected}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.onAddCurrentRemotePath();
            }}
          >
            +
          </button>
        </div>
        {!props.remoteConnected ? (
          <>
            <div className="v12m-srow v12m-srow--disabled" aria-disabled="true">
              <span className="v12m-srow-label">Connect to a saved profile</span>
            </div>
            <p className="v12m-ssec-hint">Per-profile remote shortcuts appear here after you connect.</p>
          </>
        ) : props.remoteFavorites.length === 0 ? (
          <p className="v12m-ssec-hint">No remote favorites for this profile.</p>
        ) : (
          props.remoteFavorites.map((f) => {
            const active = normalizeRemote(props.currentRemotePath) === normalizeRemote(f.path);
            return (
              <div key={f.id} className={`v12m-srow ${active ? "on" : ""}`}>
                <button type="button" className="v12m-srow-main" title={f.path} onClick={() => props.onSelectRemoteFavorite(f.path)}>
                  <span className="v12m-srow-ic" aria-hidden>
                    <V12Icon name="folder" />
                  </span>
                  <span className="v12m-srow-text">
                    <span className="v12m-srow-label">{f.label}</span>
                    <span className="v12m-srow-path">{f.path}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="v12m-srow-del"
                  title="Remove remote favorite"
                  aria-label={`Remove ${f.label} from remote favorites`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onRemoveRemoteFavorite(f.id);
                  }}
                >
                  ×
                </button>
                <span className="v12m-srow-tools">
                  <button type="button" title="Move up" onClick={() => props.onReorderRemoteFavorite(f.id, "up")}>
                    ↑
                  </button>
                  <button type="button" title="Move down" onClick={() => props.onReorderRemoteFavorite(f.id, "down")}>
                    ↓
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="v12m-sidebar-footer">
        <button
          type="button"
          className="v12m-sidebar-preferences"
          title="Preferences"
          aria-label="Preferences"
          onClick={() => props.onOpenPreferences()}
        >
          <V12TbIcon name="gear-preferences" />
        </button>
        <button
          type="button"
          className="v12m-sidebar-toggle"
          title="Hide Sidebar"
          aria-label="Hide Sidebar"
          onClick={() => props.onToggleSidebar()}
        >
          <V12TbIcon name="sidebar-toggle" />
        </button>
      </div>
    </aside>
  );
}

function normalizeRemote(p: string): string {
  const out = (p || "/").replace(/\/+/g, "/").replace(/\/+$/, "");
  return out || "/";
}
