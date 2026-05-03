import type { ReactElement } from "react";
import type { LocalFavoriteListItem } from "../../shared/localFavorites";
import { pickActiveFavoriteId } from "../../shared/localFavorites";
import { V12Icon } from "./shared/V12Icons";

export type V12LocalFavoritesSidebarProps = {
  favorites: LocalFavoriteListItem[];
  currentLocalPath: string;
  /** Short transient message (e.g. duplicate path, IPC error). */
  hint?: string;
  onSelectFavorite: (path: string) => void;
  onAddCurrentPath: () => void;
  onRemoveFavorite: (id: string) => void;
  /** Restore Home / Desktop / Downloads / Documents after any were removed. */
  onRestoreDefaults: () => void;
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
                <span className="v12m-srow-label">{f.label}</span>
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
        <h3>Remote Favorites</h3>
        <div className="v12m-srow v12m-srow--disabled" aria-disabled="true">
          <span className="v12m-srow-label">Coming in V1.3</span>
        </div>
        <p className="v12m-ssec-hint">Per-profile remote shortcuts will appear here after you connect.</p>
      </div>
    </aside>
  );
}
