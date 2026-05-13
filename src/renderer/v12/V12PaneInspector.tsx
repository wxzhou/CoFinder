import type { ReactElement } from "react";
import type { PathInfo } from "../../shared/types/ipc";
import { V12Icon } from "./shared/V12Icons";
import { multiSelectionFileBytes, multiSelectionPreviewNames, pathInfoKindLabel } from "./v12InspectorSummary";

export type V12PaneInspectorProps = {
  scope: "local" | "remote";
  selectionCount: number;
  selectedPaths: string[];
  entries: Array<{ fullPath: string; name: string; size: number; type: string }>;
  info: PathInfo | null;
  infoLoading: boolean;
  infoError: string;
  formatSize: (n: number) => string;
  formatTime: (iso: string) => string;
  /** Remote pane: host for Details row */
  hostLabel?: string;
  onQuickLook?: () => void;
  onRevealInFinder?: () => void;
  onCopyPaths?: () => void;
};

export function V12PaneInspector(props: V12PaneInspectorProps): ReactElement {
  const { selectionCount: n } = props;
  const empty = n === 0;
  const multi = n > 1;
  const single = n === 1;
  const aria = props.scope === "local" ? "Local inspector" : "Remote inspector";

  const multiBytes = multi ? multiSelectionFileBytes(props.selectedPaths, props.entries) : 0;
  const previewNames = multi ? multiSelectionPreviewNames(props.selectedPaths, props.entries) : [];

  const iconName =
    single && props.info?.type === "directory" ? ("folder" as const) : single && props.info ? ("doc" as const) : ("doc" as const);

  return (
    <aside className="v12m-inspector v12m-inspector--pane" aria-label={aria}>
      <div className="v12m-insp-hdr">Info</div>

      {empty ? (
        <p className="v12m-insp-empty">Nothing selected</p>
      ) : null}

      {multi ? (
        <>
          <div className="v12m-insp-block">
            <h2 className="v12m-insp-name">{n} items selected</h2>
            <p className="v12m-insp-line">
              {multiBytes > 0 ? `${props.formatSize(multiBytes)} in files` : "—"}
              {previewNames.length ? ` · ${previewNames.join(", ")}${n > previewNames.length ? ", …" : ""}` : ""}
            </p>
            <p className="v12m-insp-line v12m-insp-line--sub">
              Details below apply to a single item.
            </p>
          </div>
          <div className="v12m-insp-actions">
            <button type="button" className="v12m-insp-linkbtn" disabled>
              Quick Look
            </button>
            {props.scope === "local" ? (
              <button type="button" className="v12m-insp-linkbtn" disabled>
                Reveal in Finder
              </button>
            ) : null}
            <button
              type="button"
              className="v12m-insp-linkbtn"
              disabled={!props.onCopyPaths}
              onClick={() => props.onCopyPaths?.()}
            >
              {props.scope === "local" ? "Copy paths" : "Copy remote paths"}
            </button>
          </div>
        </>
      ) : null}

      {single ? (
        <>
          {props.infoLoading ? <p className="v12m-insp-empty">Loading…</p> : null}
          {!props.infoLoading && props.infoError ? <p className="v12m-insp-empty v12m-insp-empty--err">{props.infoError}</p> : null}
          {!props.infoLoading && !props.infoError && props.info ? (
            <>
              <div className="v12m-insp-prev">
                <div className="v12m-insp-iconwrap">
                  <V12Icon name={iconName} size="lg" />
                </div>
                <div className="v12m-insp-prev-cap">{pathInfoKindLabel(props.info.type)}</div>
              </div>
              <div className="v12m-insp-block">
                <h2 className="v12m-insp-name">{props.info.name}</h2>
                <p className="v12m-insp-line">
                  {props.info.type === "directory" ? "—" : props.formatSize(props.info.size)} · Modified {props.formatTime(props.info.mtime)}
                </p>
              </div>
              <div className="v12m-insp-sect">
                <h3>Details</h3>
                <ul className="v12m-insp-kv">
                  <li>
                    <span>Type</span>
                    <span>{pathInfoKindLabel(props.info.type)}</span>
                  </li>
                  <li>
                    <span>Path</span>
                    <span className="v12m-mono">{props.info.fullPath}</span>
                  </li>
                  <li>
                    <span>Size</span>
                    <span>{props.info.type === "directory" ? "—" : props.formatSize(props.info.size)}</span>
                  </li>
                  <li>
                    <span>Modified</span>
                    <span>{props.formatTime(props.info.mtime)}</span>
                  </li>
                  {props.info.type === "directory" && typeof props.info.fileCount === "number" ? (
                    <li>
                      <span>Files</span>
                      <span>{props.info.fileCount}</span>
                    </li>
                  ) : null}
                  {props.info.type === "directory" && typeof props.info.folderCount === "number" ? (
                    <li>
                      <span>Folders</span>
                      <span>{props.info.folderCount}</span>
                    </li>
                  ) : null}
                  {props.info.permissions ? (
                    <li>
                      <span>Permissions</span>
                      <span className="v12m-mono">{props.info.permissions}</span>
                    </li>
                  ) : null}
                  {props.info.owner ? (
                    <li>
                      <span>Owner</span>
                      <span>{props.info.owner}</span>
                    </li>
                  ) : null}
                  {props.info.group ? (
                    <li>
                      <span>Group</span>
                      <span>{props.info.group}</span>
                    </li>
                  ) : null}
                  {props.scope === "remote" && props.hostLabel ? (
                    <li>
                      <span>Server</span>
                      <span>{props.hostLabel}</span>
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className="v12m-insp-actions">
                <button
                  type="button"
                  className="v12m-insp-linkbtn"
                  disabled={props.scope !== "local" || !props.onQuickLook}
                  onClick={() => props.onQuickLook?.()}
                >
                  Quick Look
                </button>
                {props.scope === "local" ? (
                  <button type="button" className="v12m-insp-linkbtn" disabled={!props.onRevealInFinder} onClick={() => props.onRevealInFinder?.()}>
                    Reveal in Finder
                  </button>
                ) : null}
                <button type="button" className="v12m-insp-linkbtn" disabled={!props.onCopyPaths} onClick={() => props.onCopyPaths?.()}>
                  {props.scope === "local" ? "Copy path" : "Copy remote path"}
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
