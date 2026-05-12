import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import { TabBar } from "./components/TabBar";
import { SiteManagerModal } from "./components/SiteManagerModal";
import { AppShellV12 } from "./v12/AppShellV12";
import { V12Toolbar } from "./v12/V12Toolbar";
import { V12TransferDrawer } from "./v12/V12TransferDrawer";
import { V12PaneInspector } from "./v12/V12PaneInspector";
import { pathToSegments } from "./v12/pane/pathSegments";
import { inspectorColumnVisible } from "./v12/v12InspectorVisibility";
import { V12PaneFootStatus, V12ProdDevHint, V12VisualFileList, V12VisualLocationStrip } from "./v12/shared";
import { V12LocalFavoritesSidebar } from "./v12/V12LocalFavoritesSidebar";
import { V12RemoteEmbeddedConnect, type V12EmbeddedRemoteConnectSubmit } from "./v12/V12RemoteEmbeddedConnect";
import { validateEmbeddedRemoteConnectInput } from "./embeddedRemoteConnect";
import {
  addRecentPath,
  buildPathSuggestions,
  filterEntriesByName,
  type RecentPath
} from "./navigationEfficiency";
import {
  applyMarqueeSelection,
  applyRowSelection,
  clearSelectionState,
  normalizeContextSelection,
  normalizeDragRect,
  selectAllRows,
  stringifySelection,
  type MarqueeRowRect,
  type SelectionState
} from "./selection";
import type { LocalFavoriteListItem } from "../shared/localFavorites";
import type {
  EnqueueDownloadRequest,
  EnqueueUploadRequest,
  AppSettings,
  PathInfo,
  ProfileUpsertPayload,
  RemoteConnectRequest,
  TransferConflict,
  TransferConflictPolicy,
  TransferUpdatePayload
} from "../shared/types/ipc";
import type { LocalFileEntry, RemoteFileEntry, ServerProfile, SortDirection, SortKey, TransferTask } from "../shared/types/models";

type HistoryState = {
  backStack: string[];
  forwardStack: string[];
};

type RemoteConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
type LocalPaneState = {
  currentPath: string;
  pathInput: string;
  filterText: string;
  entries: LocalFileEntry[];
  selectedFullPaths: string[];
  selectionAnchorFullPath: string | null;
  error: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  history: HistoryState;
};
type RemotePaneState = {
  connectionStatus: RemoteConnectionStatus;
  connectionId: string | null;
  /** Last profile id used for this connection, if any */
  activeProfileId: string | null;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  homePath: string;
  currentPath: string;
  pathInput: string;
  filterText: string;
  entries: RemoteFileEntry[];
  selectedFullPaths: string[];
  selectionAnchorFullPath: string | null;
  sortKey: SortKey;
  sortDirection: SortDirection;
  history: HistoryState;
  error: string;
};

type ContextMenuState = {
  pane: "local" | "remote";
  tabId: string;
  x: number;
  y: number;
};

type InlineRenameState = {
  pane: "local" | "remote";
  tabId: string;
  connectionId: string | null;
  sourcePath: string;
  currentName: string;
  draftName: string;
};

type DeleteConfirmState = {
  pane: "local" | "remote";
  tabId: string;
  connectionId: string | null;
  paths: string[];
  names: string[];
};

type InfoDialogState = {
  pane: "local" | "remote";
  info: PathInfo;
  isSizeLoading: boolean;
};

type ActivePane = "local" | "remote";

type TransferDragPayload = {
  kind: "cofinder-transfer";
  pane: ActivePane;
  tabId: string;
  paths: string[];
};

type DropTargetState = {
  pane: ActivePane;
  path: string;
  valid: boolean;
};

type MarqueeState = {
  pane: ActivePane;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  baseSelection: SelectionState;
};

type SiteManagerTabState = {
  open: boolean;
  profiles: ServerProfile[];
  selectedProfileId: string | null;
  draft: ProfileUpsertPayload;
  passwordDirty: boolean;
  listError: string;
  modalError: string;
  busy: "idle" | "load" | "save" | "login" | "delete";
  credentialAvailable: boolean;
};
type UiTabState = {
  id: string;
  title: string;
  createdAt: number;
  localPane: LocalPaneState;
  remotePane: RemotePaneState;
};

const AUTO_HIDE_DELAY_MS = 10_000;
const COFINDER_TRANSFER_MIME = "application/x-cofinder-transfer";
const COFINDER_LAST_LOCAL_PATH_KEY = "cofinder.lastLocalPath";
const COFINDER_LOCAL_RECENTS_KEY = "cofinder.recent.localPaths.v1";
const COFINDER_REMOTE_RECENTS_KEY = "cofinder.recent.remotePathsByProfile.v1";
const INLINE_RENAME_CLICK_MIN_MS = 350;
const INLINE_RENAME_CLICK_MAX_MS = 1500;
/** After a row `click` with `detail === 1`, wait this long before showing inspector so a double-click rarely mounts the column. Cmd+A bypasses. If already revealed, no delay and no hide. */
const V12_INSPECTOR_CLICK_GAP_MS = 350;

const DEFAULT_RENDERER_SETTINGS: AppSettings = {
  schemaVersion: 1,
  general: {
    defaultLocalPath: "",
    restoreLastSession: false,
    confirmBeforeDelete: true,
    showHiddenFiles: false
  },
  transfer: {
    defaultConflictPolicy: "prompt",
    queueAutoHideDelayMs: AUTO_HIDE_DELAY_MS,
    preserveTimestamps: true
  },
  appearance: {
    rowDensity: "comfortable",
    defaultInspectorVisible: false,
    defaultPaneRatio: 0.5,
    sidebarVisible: true
  }
};

type PreferencesState = {
  open: boolean;
  draft: AppSettings;
  error: string;
};

type QueuePanelState = "hidden" | "expanded" | "collapsed" | "autoHidePending";
type PlainClickRecord = {
  pane: "local" | "remote";
  tabId: string;
  path: string;
  at: number;
};

export type AppUiShell = "v11" | "v12";

export type AppProps = {
  uiShell?: AppUiShell;
};

export function App(props: AppProps = {}) {
  const { uiShell = "v12" } = props;
  const [appVersion, setAppVersion] = useState("unknown");
  const [tabState] = useState(() => {
    const firstTabId = createId();
    return {
      firstTabId,
      tabs: [createTabState(firstTabId, 1)],
      activeTabId: firstTabId
    };
  });
  const [tabs, setTabs] = useState<UiTabState[]>(tabState.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(tabState.activeTabId);
  const [siteManagerByTab, setSiteManagerByTab] = useState<Record<string, SiteManagerTabState>>({});
  const [v12EmbeddedRemoteCatalog, setV12EmbeddedRemoteCatalog] = useState<{
    profiles: ServerProfile[];
    listError: string;
    credentialAvailable: boolean;
  }>({ profiles: [], listError: "", credentialAvailable: false });
  const [v12RemoteEmbeddedInitialProfileByTab, setV12RemoteEmbeddedInitialProfileByTab] = useState<Record<string, string>>({});
  const siteManagerRef = useRef(siteManagerByTab);
  useEffect(() => {
    siteManagerRef.current = siteManagerByTab;
  }, [siteManagerByTab]);
  const [queuePanelState, setQueuePanelState] = useState<QueuePanelState>("hidden");
  const [queuePinned, setQueuePinned] = useState<boolean>(false);
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const [queueError, setQueueError] = useState<string>("");
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_RENDERER_SETTINGS);
  const [preferences, setPreferences] = useState<PreferencesState>({
    open: false,
    draft: DEFAULT_RENDERER_SETTINGS,
    error: ""
  });
  const [localRecentPaths, setLocalRecentPaths] = useState<RecentPath[]>(() => readRecentPathList(COFINDER_LOCAL_RECENTS_KEY));
  const [remoteRecentPathsByProfile, setRemoteRecentPathsByProfile] = useState<Record<string, RecentPath[]>>(() =>
    readRemoteRecentPathsByProfile()
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineRename, setInlineRename] = useState<InlineRenameState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [infoDialog, setInfoDialog] = useState<InfoDialogState | null>(null);
  const infoRequestTokenRef = useRef(0);
  const lastPlainClickRef = useRef<PlainClickRecord | null>(null);
  const [activePane, setActivePane] = useState<ActivePane>("local");
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [localHomePath, setLocalHomePath] = useState<string>("");
  const [v12PaneRatio, setV12PaneRatio] = useState(() => {
    const raw = window.localStorage.getItem("cofinder.v12PaneRatio");
    const n = raw ? Number(raw) : 0.5;
    return Number.isFinite(n) && n >= 0.25 && n <= 0.75 ? n : 0.5;
  });
  const v12LocalInspTokenRef = useRef(0);
  const v12RemoteInspTokenRef = useRef(0);
  const v12LocalInspRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const v12RemoteInspRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveTabIdForV12InspRef = useRef(activeTabId);
  const [v12LocalInspectorReveal, setV12LocalInspectorReveal] = useState(false);
  const [v12RemoteInspectorReveal, setV12RemoteInspectorReveal] = useState(false);
  type V12InspPaneState = { status: "idle" | "loading" | "ready" | "error"; info: PathInfo | null; error: string };
  const [v12LocalInsp, setV12LocalInsp] = useState<V12InspPaneState>({ status: "idle", info: null, error: "" });
  const [v12RemoteInsp, setV12RemoteInsp] = useState<V12InspPaneState>({ status: "idle", info: null, error: "" });
  const [v12LocalFavorites, setV12LocalFavorites] = useState<LocalFavoriteListItem[]>([]);
  const [v12FavoriteHint, setV12FavoriteHint] = useState("");
  const v12FavoriteHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelV12LocalInspRevealTimer = (): void => {
    if (v12LocalInspRevealTimerRef.current != null) {
      clearTimeout(v12LocalInspRevealTimerRef.current);
      v12LocalInspRevealTimerRef.current = null;
    }
  };
  const cancelV12RemoteInspRevealTimer = (): void => {
    if (v12RemoteInspRevealTimerRef.current != null) {
      clearTimeout(v12RemoteInspRevealTimerRef.current);
      v12RemoteInspRevealTimerRef.current = null;
    }
  };
  const scheduleV12LocalInspRevealFromRowClick = (): void => {
    cancelV12LocalInspRevealTimer();
    if (v12LocalInspectorReveal) {
      return;
    }
    v12LocalInspRevealTimerRef.current = setTimeout(() => {
      v12LocalInspRevealTimerRef.current = null;
      setV12LocalInspectorReveal(true);
    }, V12_INSPECTOR_CLICK_GAP_MS);
  };
  const scheduleV12RemoteInspRevealFromRowClick = (): void => {
    cancelV12RemoteInspRevealTimer();
    if (v12RemoteInspectorReveal) {
      return;
    }
    v12RemoteInspRevealTimerRef.current = setTimeout(() => {
      v12RemoteInspRevealTimerRef.current = null;
      setV12RemoteInspectorReveal(true);
    }, V12_INSPECTOR_CLICK_GAP_MS);
  };

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const localPane = activeTab.localPane;
  const remotePane = activeTab.remotePane;
  const remoteConnected = remotePane.connectionStatus === "connected" && !!remotePane.connectionId;
  const activeTabRemoteDisconnected = useMemo(
    () => !(remotePane.connectionStatus === "connected" && remotePane.connectionId),
    [remotePane.connectionStatus, remotePane.connectionId]
  );

  useEffect(() => {
    void (async () => {
      const res = await window.cofinder.settings.get();
      const settings = res.ok ? res.data : DEFAULT_RENDERER_SETTINGS;
      if (!res.ok) setQueueError(res.error.message);
      setAppSettings(settings);
      setPreferences((prev) => ({ ...prev, draft: settings }));
      setV12PaneRatio(settings.appearance.defaultPaneRatio);
      setV12LocalInspectorReveal(settings.appearance.defaultInspectorVisible);
      setV12RemoteInspectorReveal(settings.appearance.defaultInspectorVisible);
      const restoredLocalPath = settings.general.restoreLastSession ? readLastLocalPath() : "";
      await initializeLocalHome(tabState.firstTabId, restoredLocalPath || settings.general.defaultLocalPath);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!appSettings.general.restoreLastSession) {
      window.localStorage.removeItem(COFINDER_LAST_LOCAL_PATH_KEY);
      return;
    }
    if (localPane.currentPath) {
      window.localStorage.setItem(COFINDER_LAST_LOCAL_PATH_KEY, localPane.currentPath);
    }
  }, [appSettings.general.restoreLastSession, localPane.currentPath]);
  useEffect(() => {
    void (async () => {
      const result = await window.cofinder.system.getAppVersion();
      if (result.ok) {
        setAppVersion(result.data.version);
      }
    })();
  }, []);
  async function initializeLocalHome(tabId: string, preferredPath?: string): Promise<void> {
    const homeRes = await window.cofinder.local.getHomePath();
    if (!homeRes.ok) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId ? { ...tab, localPane: { ...tab.localPane, error: homeRes.error.message } } : tab
        )
      );
      return;
    }
    const homePath = homeRes.data.homePath;
    setLocalHomePath(homePath);
    await navigateLocal(tabId, preferredPath?.trim() || homePath, "replace");
  }

  function updateLocalFilter(tabId: string, value: string): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              localPane: {
                ...tab.localPane,
                filterText: value,
                selectedFullPaths: [],
                selectionAnchorFullPath: null
              }
            }
          : tab
      )
    );
  }

  function updateRemoteFilter(tabId: string, value: string): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              remotePane: {
                ...tab.remotePane,
                filterText: value,
                selectedFullPaths: [],
                selectionAnchorFullPath: null
              }
            }
          : tab
      )
    );
  }

  function rememberLocalRecent(targetPath: string): void {
    setLocalRecentPaths((prev) => {
      const next = addRecentPath(prev, targetPath);
      writeJsonLocalStorage(COFINDER_LOCAL_RECENTS_KEY, next);
      return next;
    });
  }

  function rememberRemoteRecent(profileId: string | null | undefined, targetPath: string): void {
    if (!profileId) return;
    setRemoteRecentPathsByProfile((prev) => {
      const next = { ...prev, [profileId]: addRecentPath(prev[profileId] ?? [], targetPath) };
      writeJsonLocalStorage(COFINDER_REMOTE_RECENTS_KEY, next);
      return next;
    });
  }

  function clearLocalRecents(): void {
    setLocalRecentPaths([]);
    window.localStorage.removeItem(COFINDER_LOCAL_RECENTS_KEY);
  }

  function clearRemoteRecents(profileId: string | null | undefined): void {
    if (!profileId) return;
    setRemoteRecentPathsByProfile((prev) => {
      const next = { ...prev };
      delete next[profileId];
      writeJsonLocalStorage(COFINDER_REMOTE_RECENTS_KEY, next);
      return next;
    });
  }


  useEffect(() => {
    const off = window.cofinder.transfer.onUpdate((payload: TransferUpdatePayload) => {
      setTransferTasks(payload.tasks);
    });
    void loadTransferTasks();
    return off;
  }, []);

  useEffect(() => {
    if (!marquee) return;
    const onMove = (event: MouseEvent) => {
      const rect = normalizeDragRect(marquee.startX, marquee.startY, event.clientX, event.clientY);
      const rows: MarqueeRowRect[] = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-marquee-pane="${marquee.pane}"][data-full-path]`)
      ).map((row) => {
        const bounds = row.getBoundingClientRect();
        return {
          fullPath: row.dataset.fullPath ?? "",
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom
        };
      });
      updatePaneSelection(activeTab.id, marquee.pane, applyMarqueeSelection(rows, rect, marquee.baseSelection, { additive: marquee.additive }));
      setMarquee((prev) => (prev ? { ...prev, currentX: event.clientX, currentY: event.clientY } : prev));
    };
    const onUp = () => setMarquee(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [activeTab.id, marquee]);

  useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.getAttribute("contenteditable") === "true" || el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const isSelectAll = (event.key === "a" || event.key === "A") && (event.metaKey || event.ctrlKey);
      const isQuickLook =
        event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.repeat;
      if (isQuickLook) {
        if (contextMenu) return;
        if (isEditableTarget(document.activeElement)) return;
        if (activePane === "remote") {
          setTabs((prev) =>
            prev.map((item) =>
              item.id === activeTab.id
                ? {
                    ...item,
                    remotePane: {
                      ...item.remotePane,
                      error: "Remote Quick Look is not implemented yet. Double-click a remote file or use Open for read-only preview."
                    }
                  }
                : item
            )
          );
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        void quickLookSelection(activeTab.id, activePane);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isSelectAll) {
        if (contextMenu) return;
        if (isEditableTarget(document.activeElement)) return;

        if (activePane === "local") {
          const selectedState = selectAllRows(localPane.entries, "first");
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeTab.id ? { ...tab, localPane: { ...tab.localPane, ...selectedState } } : tab
            )
          );
          if (uiShell === "v12") {
            cancelV12LocalInspRevealTimer();
            setV12LocalInspectorReveal(true);
          }
          event.preventDefault();
          event.stopPropagation();
        }
        if (activePane === "remote") {
          const selectedState = selectAllRows(remotePane.entries, "first");
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeTab.id ? { ...tab, remotePane: { ...tab.remotePane, ...selectedState } } : tab
            )
          );
          if (uiShell === "v12") {
            cancelV12RemoteInspRevealTimer();
            setV12RemoteInspectorReveal(true);
          }
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const cmd = event.metaKey || event.ctrlKey;
      if (!cmd && event.key !== "F2" && event.key !== "Delete" && event.key !== "Backspace") return;
      if (contextMenu) return;
      if (isEditableTarget(document.activeElement)) return;

      const key = event.key.toLowerCase();
      const prevent = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (event.key === "F2") {
        openInlineRename(activeTab.id, activePane);
        prevent();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        openDeleteConfirm(activeTab.id, activePane);
        prevent();
      } else if (cmd && key === "i") {
        void openInfoDialog(activeTab.id, activePane);
        prevent();
      } else if (cmd && event.shiftKey && key === "c") {
        void copySelection(activeTab.id, activePane, "path");
        prevent();
      } else if (cmd && key === "r") {
        if (activePane === "local" && localPane.currentPath) void navigateLocal(activeTab.id, localPane.currentPath, "replace");
        if (activePane === "remote" && remotePane.connectionId) void listRemotePath(remotePane.connectionId, remotePane.currentPath, "replace", activeTab.id);
        prevent();
      } else if (cmd && key === "n") {
        createTab();
        prevent();
      } else if (cmd && key === "w") {
        void closeTab(activeTab.id);
        prevent();
      } else if (cmd && key === "]") {
        const index = tabs.findIndex((tab) => tab.id === activeTab.id);
        const next = tabs[(index + 1) % tabs.length];
        if (next) setActiveTabId(next.id);
        prevent();
      } else if (cmd && key === "[") {
        const index = tabs.findIndex((tab) => tab.id === activeTab.id);
        const next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (next) setActiveTabId(next.id);
        prevent();
      } else if (cmd && key === "u") {
        void enqueueUpload(activeTab.id);
        prevent();
      } else if (cmd && key === "d") {
        void enqueueDownload(activeTab.id);
        prevent();
      } else if (cmd && key === "1") {
        setActivePane("local");
        prevent();
      } else if (cmd && key === "2") {
        setActivePane("remote");
        prevent();
      } else if (cmd && key === "k") {
        openSiteManagerForTab(activeTab.id);
        prevent();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePane, contextMenu, localPane, remotePane, activeTab.id, setTabs, tabs, uiShell]);

  async function loadTransferTasks(): Promise<void> {
    const res = await window.cofinder.transfer.list();
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setTransferTasks(res.data);
  }

  async function clearCompletedTransfers(): Promise<void> {
    const res = await window.cofinder.transfer.clearCompleted();
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    if (res.data.cleared === 0 && transferTasks.length === 0) setQueuePanelState("hidden");
  }

  async function retryTransferTask(taskId: string): Promise<void> {
    const res = await window.cofinder.transfer.retry({ taskId });
    if (!res.ok) setQueueError(res.error.message);
  }

  async function retryFailedTransfers(): Promise<void> {
    const res = await window.cofinder.transfer.retryFailed();
    if (!res.ok) setQueueError(res.error.message);
  }

  async function copyTransferError(taskId: string): Promise<void> {
    const task = transferTasks.find((item) => item.id === taskId);
    if (!task) return;
    const text = [task.errorCode ? `Code: ${task.errorCode}` : "", task.error, ...task.rawLog.slice(-20)].filter(Boolean).join("\n");
    const res = await window.cofinder.system.copyText({ text });
    if (!res.ok) setQueueError(res.error.message);
  }

  function openPreferences(): void {
    setPreferences({ open: true, draft: appSettings, error: "" });
  }

  async function savePreferences(): Promise<void> {
    const res = await window.cofinder.settings.set(preferences.draft);
    if (!res.ok) {
      setPreferences((prev) => ({ ...prev, error: res.error.message }));
      return;
    }
    setAppSettings(res.data);
    setPreferences({ open: false, draft: res.data, error: "" });
    setV12PaneRatio(res.data.appearance.defaultPaneRatio);
  }

  async function navigateLocal(
    tabId: string,
    targetPath: string,
    mode: "push" | "replace" | "back" | "forward" = "push"
  ): Promise<void> {
    const previousPath = tabs.find((tab) => tab.id === tabId)?.localPane.currentPath ?? "";
    const response = await window.cofinder.local.listDirectory({ path: targetPath });
    if (!response.ok) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id !== tabId
            ? tab
            : {
                ...tab,
                localPane: {
                  ...tab.localPane,
                  error: response.error.message,
                  pathInput: previousPath
                }
              }
        )
      );
      return;
    }
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        const nextHistory = computeHistory(tab.localPane.history, mode, previousPath, response.data.path);
        return {
          ...tab,
          localPane: {
            ...tab.localPane,
            error: "",
            entries: response.data.entries,
            currentPath: response.data.path,
            pathInput: response.data.path,
            selectedFullPaths: [],
            selectionAnchorFullPath: null,
            history: nextHistory
          }
        };
      })
    );
    rememberLocalRecent(response.data.path);
  }

  const showV12FavoriteHint = useCallback((message: string) => {
    if (v12FavoriteHintTimerRef.current != null) clearTimeout(v12FavoriteHintTimerRef.current);
    setV12FavoriteHint(message);
    v12FavoriteHintTimerRef.current = setTimeout(() => {
      v12FavoriteHintTimerRef.current = null;
      setV12FavoriteHint("");
    }, 2800);
  }, []);

  useEffect(
    () => () => {
      if (v12FavoriteHintTimerRef.current != null) clearTimeout(v12FavoriteHintTimerRef.current);
    },
    []
  );

  const refreshV12LocalFavorites = useCallback(async () => {
    try {
      const api = window.cofinder?.localFavorites;
      if (!api?.list) {
        showV12FavoriteHint("Local favorites are unavailable. Quit and reopen the app.");
        return;
      }
      const r = await api.list();
      if (r.ok) setV12LocalFavorites(r.data.favorites);
      else showV12FavoriteHint(r.error.message);
    } catch (err) {
      showV12FavoriteHint(err instanceof Error ? err.message : "Failed to load favorites.");
    }
  }, [showV12FavoriteHint]);

  useEffect(() => {
    if (uiShell !== "v12") return;
    void refreshV12LocalFavorites();
  }, [uiShell, refreshV12LocalFavorites]);

  async function handleV12AddLocalFavorite(): Promise<void> {
    try {
      const api = window.cofinder?.localFavorites;
      if (!api?.add) {
        showV12FavoriteHint("Local favorites are unavailable. Quit and reopen the app.");
        return;
      }
      const p = localPane.currentPath || "/";
      const res = await api.add({ path: p });
      if (!res.ok) {
        if (res.error.code === "LOCAL_FAVORITES_DUPLICATE") {
          showV12FavoriteHint("That folder is already in favorites.");
          return;
        }
        showV12FavoriteHint(res.error.message);
        setQueueError(res.error.message);
        return;
      }
      setV12LocalFavorites(res.data.favorites);
    } catch (err) {
      showV12FavoriteHint(err instanceof Error ? err.message : "Failed to add favorite.");
    }
  }

  async function handleV12RemoveLocalFavorite(id: string): Promise<void> {
    try {
      const api = window.cofinder?.localFavorites;
      if (!api?.remove) {
        showV12FavoriteHint("Local favorites are unavailable. Quit and reopen the app.");
        return;
      }
      const res = await api.remove({ id });
      if (!res.ok) {
        showV12FavoriteHint(res.error.message);
        setQueueError(res.error.message);
        return;
      }
      setV12LocalFavorites(res.data.favorites);
    } catch (err) {
      showV12FavoriteHint(err instanceof Error ? err.message : "Failed to remove favorite.");
    }
  }

  async function handleV12RestoreDefaultFavorites(): Promise<void> {
    try {
      const api = window.cofinder?.localFavorites;
      if (!api?.resetDefaults) {
        showV12FavoriteHint("Local favorites are unavailable. Quit and reopen the app.");
        return;
      }
      const res = await api.resetDefaults();
      if (!res.ok) {
        showV12FavoriteHint(res.error.message);
        setQueueError(res.error.message);
        return;
      }
      setV12LocalFavorites(res.data.favorites);
    } catch (err) {
      showV12FavoriteHint(err instanceof Error ? err.message : "Failed to restore defaults.");
    }
  }

  async function handleV12ReorderLocalFavorite(id: string, direction: "up" | "down"): Promise<void> {
    const res = await window.cofinder.localFavorites.reorder({ id, direction });
    if (res.ok) setV12LocalFavorites(res.data.favorites);
    else showV12FavoriteHint(res.error.message);
  }

  const queueStats = useMemo(() => {
    const activeCount = transferTasks.filter((task) => task.status === "running").length;
    const queuedCount = transferTasks.filter((task) => task.status === "pending").length;
    const failedCount = transferTasks.filter((task) => task.status === "failed").length;
    const completedCount = transferTasks.filter((task) =>
      task.status === "success" || task.status === "canceled" || task.status === "stopped"
    ).length;
    const allDone = transferTasks.length > 0 && activeCount === 0 && queuedCount === 0;
    return { activeCount, queuedCount, failedCount, completedCount, allDone };
  }, [transferTasks]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (transferTasks.length === 0) {
      setQueuePanelState("hidden");
      return;
    }

    if (queueStats.allDone && queueStats.failedCount === 0 && !queuePinned) {
      setQueuePanelState("autoHidePending");
      timer = setTimeout(() => {
        setQueuePanelState("hidden");
        void clearCompletedTransfers();
      }, appSettings.transfer.queueAutoHideDelayMs);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    setQueuePanelState((prev) => {
      if (prev === "hidden" || prev === "autoHidePending") return "expanded";
      return prev;
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [transferTasks, queuePinned, queueStats.allDone, queueStats.failedCount, appSettings.transfer.queueAutoHideDelayMs]);

  const sortedEntries = useMemo(() => {
    const copied = localPane.entries.filter((entry) => appSettings.general.showHiddenFiles || !entry.name.startsWith("."));
    copied.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;

      let value = 0;
      if (localPane.sortKey === "name") value = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (localPane.sortKey === "size") value = a.size - b.size;
      if (localPane.sortKey === "mtime") value = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      return localPane.sortDirection === "asc" ? value : -value;
    });
    return filterEntriesByName(copied, localPane.filterText);
  }, [appSettings.general.showHiddenFiles, localPane.entries, localPane.filterText, localPane.sortDirection, localPane.sortKey]);

  const sortedRemoteEntries = useMemo(() => {
    const copied = remotePane.entries.filter((entry) => appSettings.general.showHiddenFiles || !entry.name.startsWith("."));
    copied.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      let value = 0;
      if (remotePane.sortKey === "name") value = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (remotePane.sortKey === "size") value = a.size - b.size;
      if (remotePane.sortKey === "mtime") value = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      return remotePane.sortDirection === "asc" ? value : -value;
    });
    return filterEntriesByName(copied, remotePane.filterText);
  }, [appSettings.general.showHiddenFiles, remotePane.entries, remotePane.filterText, remotePane.sortDirection, remotePane.sortKey]);

  const selectedEntries = sortedEntries.filter((entry) => localPane.selectedFullPaths.includes(entry.fullPath));
  const selectedSize = selectedEntries.reduce((acc, item) => acc + item.size, 0);
  const totalSize = sortedEntries.reduce((acc, item) => acc + item.size, 0);
  const remoteSelectedEntries = sortedRemoteEntries.filter((entry) => remotePane.selectedFullPaths.includes(entry.fullPath));
  const remoteSelectedSize = remoteSelectedEntries.reduce((acc, item) => acc + item.size, 0);
  const remoteTotalSize = sortedRemoteEntries.reduce((acc, item) => acc + item.size, 0);

  useEffect(() => {
    if (uiShell !== "v12") {
      cancelV12LocalInspRevealTimer();
      cancelV12RemoteInspRevealTimer();
      setV12LocalInspectorReveal(false);
      setV12RemoteInspectorReveal(false);
      return;
    }
    if (localPane.selectedFullPaths.length === 0) {
      cancelV12LocalInspRevealTimer();
      setV12LocalInspectorReveal(false);
    }
    if (!remoteConnected || remotePane.selectedFullPaths.length === 0) {
      cancelV12RemoteInspRevealTimer();
      setV12RemoteInspectorReveal(false);
    }
  }, [uiShell, activeTab.id, localPane.selectedFullPaths, remotePane.selectedFullPaths, remoteConnected]);

  useEffect(() => {
    if (uiShell !== "v12") return;
    if (prevActiveTabIdForV12InspRef.current === activeTabId) return;
    prevActiveTabIdForV12InspRef.current = activeTabId;
    cancelV12LocalInspRevealTimer();
    cancelV12RemoteInspRevealTimer();
    const tab = tabs.find((t) => t.id === activeTabId) ?? activeTab;
    const rc = tab.remotePane.connectionStatus === "connected" && !!tab.remotePane.connectionId;
    setV12LocalInspectorReveal(tab.localPane.selectedFullPaths.length > 0);
    setV12RemoteInspectorReveal(rc && tab.remotePane.selectedFullPaths.length > 0);
  }, [activeTabId, uiShell, tabs, activeTab]);

  useEffect(() => {
    if (uiShell !== "v12") return;
    const paths = localPane.selectedFullPaths;
    const visible =
      inspectorColumnVisible("local", paths.length, remoteConnected) && v12LocalInspectorReveal;
    if (!visible || paths.length === 0) {
      setV12LocalInsp({ status: "idle", info: null, error: "" });
      return;
    }
    if (paths.length > 1) {
      setV12LocalInsp({ status: "ready", info: null, error: "" });
      return;
    }
    const path = paths[0]!;
    const token = ++v12LocalInspTokenRef.current;
    setV12LocalInsp({ status: "loading", info: null, error: "" });
    void (async () => {
      const r = await window.cofinder.local.getInfo({ path, includeDirectorySize: false });
      if (token !== v12LocalInspTokenRef.current) return;
      if (!r.ok) {
        setV12LocalInsp({ status: "error", info: null, error: r.error.message });
        return;
      }
      const base = r.data.info;
      setV12LocalInsp({ status: "ready", info: base, error: "" });
      if (base.type === "directory") {
        const r2 = await window.cofinder.local.getInfo({ path, includeDirectorySize: true });
        if (token !== v12LocalInspTokenRef.current) return;
        if (r2.ok) {
          setV12LocalInsp({ status: "ready", info: { ...base, size: r2.data.info.size }, error: "" });
        }
      }
    })();
  }, [uiShell, remoteConnected, activeTab.id, localPane.selectedFullPaths, v12LocalInspectorReveal]);

  useEffect(() => {
    if (uiShell !== "v12") return;
    const conn = remotePane.connectionId;
    const paths = remotePane.selectedFullPaths;
    const visible = inspectorColumnVisible("remote", paths.length, !!conn) && v12RemoteInspectorReveal;
    if (!visible || !conn || paths.length === 0) {
      setV12RemoteInsp({ status: "idle", info: null, error: "" });
      return;
    }
    if (paths.length > 1) {
      setV12RemoteInsp({ status: "ready", info: null, error: "" });
      return;
    }
    const path = paths[0]!;
    const token = ++v12RemoteInspTokenRef.current;
    setV12RemoteInsp({ status: "loading", info: null, error: "" });
    void (async () => {
      const r = await window.cofinder.remote.getInfo({ connectionId: conn, path, includeDirectorySize: false });
      if (token !== v12RemoteInspTokenRef.current) return;
      if (!r.ok) {
        setV12RemoteInsp({ status: "error", info: null, error: r.error.message });
        return;
      }
      const base = r.data.info;
      setV12RemoteInsp({ status: "ready", info: base, error: "" });
      if (base.type === "directory") {
        const r2 = await window.cofinder.remote.getInfo({ connectionId: conn, path, includeDirectorySize: true });
        if (token !== v12RemoteInspTokenRef.current) return;
        if (r2.ok) {
          setV12RemoteInsp({ status: "ready", info: { ...base, size: r2.data.info.size }, error: "" });
        }
      }
    })();
  }, [uiShell, remotePane.connectionId, remotePane.selectedFullPaths, activeTab.id, v12RemoteInspectorReveal]);

  async function handleRowDoubleClick(tabId: string, entry: LocalFileEntry): Promise<void> {
    if (uiShell === "v12") {
      cancelV12LocalInspRevealTimer();
      setV12LocalInspectorReveal(false);
    }
    if (entry.type === "directory") {
      await navigateLocal(tabId, entry.fullPath);
      return;
    }
    const response = await window.cofinder.local.openPath({ path: entry.fullPath });
    if (!response.ok) {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === tabId ? { ...tab, localPane: { ...tab.localPane, error: response.error.message } } : tab))
      );
      return;
    }
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, localPane: { ...tab.localPane, error: "" } } : tab))
    );
  }

  function handleSort(tabId: string, nextKey: SortKey): void {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        const same = tab.localPane.sortKey === nextKey;
        return {
          ...tab,
          localPane: {
            ...tab.localPane,
            sortKey: same ? tab.localPane.sortKey : nextKey,
            sortDirection: same ? (tab.localPane.sortDirection === "asc" ? "desc" : "asc") : "asc"
          }
        };
      })
    );
  }

  function handleRemoteSort(tabId: string, nextKey: SortKey): void {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        const same = tab.remotePane.sortKey === nextKey;
        return {
          ...tab,
          remotePane: {
            ...tab.remotePane,
            sortKey: same ? tab.remotePane.sortKey : nextKey,
            sortDirection: same ? (tab.remotePane.sortDirection === "asc" ? "desc" : "asc") : "asc"
          }
        };
      })
    );
  }

  function getParentPath(input: string): string {
    if (!input || input === "/") return "/";
    const parts = input.split("/").filter(Boolean);
    if (parts.length === 0) return "/";
    return `/${parts.slice(0, -1).join("/")}` || "/";
  }

  function summarizeQueue(): string {
    if (queueStats.activeCount === 0 && queueStats.queuedCount === 0) {
      return queueStats.failedCount > 0 ? `${queueStats.failedCount} failed task(s)` : "No active transfers";
    }
    return `${queueStats.activeCount} active, ${queueStats.queuedCount} queued`;
  }

  function emptyProfileDraft(): ProfileUpsertPayload {
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

  function profileToDraft(profile: ServerProfile): ProfileUpsertPayload {
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

  const refreshV12EmbeddedRemoteCatalog = useCallback(async (): Promise<void> => {
    const [listRes, credRes] = await Promise.all([
      window.cofinder.profiles.list(),
      window.cofinder.credentials.isAvailable()
    ]);
    const credentialAvailable = credRes.ok ? credRes.data.available : false;
    if (!listRes.ok) {
      setV12EmbeddedRemoteCatalog({ profiles: [], listError: listRes.error.message, credentialAvailable });
      return;
    }
    setV12EmbeddedRemoteCatalog({ profiles: listRes.data, listError: "", credentialAvailable });
  }, []);

  function closeSiteManagerForTab(tabId: string): void {
    setSiteManagerByTab((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
    void refreshV12EmbeddedRemoteCatalog();
  }

  useEffect(() => {
    if (uiShell !== "v12" || !activeTabRemoteDisconnected) return;
    void refreshV12EmbeddedRemoteCatalog();
  }, [uiShell, activeTab.id, activeTabRemoteDisconnected, refreshV12EmbeddedRemoteCatalog]);

  async function refreshSiteManagerForTab(tabId: string): Promise<void> {
    const [listRes, credRes] = await Promise.all([
      window.cofinder.profiles.list(),
      window.cofinder.credentials.isAvailable()
    ]);
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur?.open) return prev;
      const credentialAvailable = credRes.ok ? credRes.data.available : false;
      if (!listRes.ok) {
        return {
          ...prev,
          [tabId]: {
            ...cur,
            busy: "idle",
            listError: listRes.error.message,
            profiles: [],
            credentialAvailable
          }
        };
      }
      return {
        ...prev,
        [tabId]: {
          ...cur,
          busy: "idle",
          profiles: listRes.data,
          listError: "",
          credentialAvailable
        }
      };
    });
  }

  function openSiteManagerForTab(tabId: string): void {
    setSiteManagerByTab((prev) => ({
      ...prev,
      [tabId]: {
        open: true,
        profiles: [],
        selectedProfileId: null,
        draft: emptyProfileDraft(),
        passwordDirty: false,
        listError: "",
        modalError: "",
        busy: "load",
        credentialAvailable: false
      }
    }));
    void refreshSiteManagerForTab(tabId);
  }

  async function finalizeRemoteConnection(
    tabId: string,
    connectionId: string,
    homePath: string,
    initialPath: string,
    titleLabel: string,
    activeProfileId: string | null,
    connMeta: { host: string; port: number; username: string; authType: "password" | "privateKey" }
  ): Promise<void> {
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId && item.remotePane.connectionStatus === "connecting"
          ? {
              ...item,
              title: titleLabel,
              remotePane: {
                ...item.remotePane,
                connectionId,
                activeProfileId,
                host: connMeta.host,
                port: connMeta.port,
                username: connMeta.username,
                authType: connMeta.authType,
                homePath: homePath || "/",
                connectionStatus: "connected"
              }
            }
          : item
      )
    );
    const listed = await listRemotePath(connectionId, initialPath, "replace", tabId);
    if (!listed) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId
            ? {
                ...item,
                remotePane: {
                  ...item.remotePane,
                  error: `Connected, but failed to list initial path: ${initialPath}. You can retry with another path.`,
                  currentPath: homePath || "/",
                  pathInput: initialPath
                }
              }
            : item
        )
      );
    }
  }

  async function connectRemoteTabFromFields(
    tabId: string,
    attempt: V12EmbeddedRemoteConnectSubmit
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const v = validateEmbeddedRemoteConnectInput({
      authType: attempt.authType,
      host: attempt.host,
      username: attempt.username,
      port: attempt.port,
      passwordTyped: attempt.passwordTyped,
      hasStoredPassword: attempt.hasStoredPassword
    });
    if (!v.ok) return { ok: false, message: v.message };

    let profileId = attempt.profileId;
    let connectPassword: string | undefined = attempt.passwordTyped.trim() || undefined;

    if (attempt.savePasswordWithTyped && attempt.profileSavePayload) {
      const saveRes = await window.cofinder.profiles.save(attempt.profileSavePayload);
      if (!saveRes.ok) {
        return { ok: false, message: saveRes.error.message };
      }
      profileId = saveRes.data.id;
      connectPassword = undefined;
      await refreshSiteManagerForTab(tabId);
      await refreshV12EmbeddedRemoteCatalog();
    }

    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId ? { ...item, remotePane: { ...item.remotePane, connectionStatus: "connecting", error: "" } } : item
      )
    );

    const connectPayload: RemoteConnectRequest = {
      profileId: profileId || undefined,
      host: attempt.host.trim(),
      port: attempt.port,
      username: attempt.username.trim(),
      password: connectPassword,
      defaultRemotePath: attempt.defaultRemotePathTrimmed,
      authType: "password"
    };

    const connectResult = await window.cofinder.remote.connect(connectPayload);
    if (!connectResult.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId
            ? {
                ...item,
                remotePane: {
                  ...item.remotePane,
                  connectionStatus: "failed",
                  error: connectResult.error.message
                }
              }
            : item
        )
      );
      return { ok: false, message: connectResult.error.message };
    }

    const { connectionId, homePath } = connectResult.data;
    const initialPath = attempt.defaultRemotePathTrimmed || homePath || "/";

    await finalizeRemoteConnection(tabId, connectionId, homePath, initialPath, attempt.aliasForTitle, profileId ?? null, {
      host: attempt.host.trim(),
      port: attempt.port,
      username: attempt.username.trim(),
      authType: "password"
    });
    await refreshV12EmbeddedRemoteCatalog();
    return { ok: true };
  }

  async function handleSiteManagerLogin(tabId: string): Promise<void> {
    const sm = siteManagerRef.current[tabId];
    if (!sm?.open) return;
    const { draft, profiles } = sm;
    const host = draft.host.trim();
    const username = draft.username.trim();
    const port = draft.port;
    const pwd = (draft.password ?? "").trim();
    const hasStored = draft.id ? profiles.some((p) => p.id === draft.id && p.hasSavedPassword) : false;

    const pre = validateEmbeddedRemoteConnectInput({
      authType: draft.authType,
      host,
      username,
      port,
      passwordTyped: pwd,
      hasStoredPassword: hasStored
    });
    if (!pre.ok) {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...(prev[tabId] ?? sm), modalError: pre.message }
      }));
      return;
    }

    setSiteManagerByTab((prev) => ({
      ...prev,
      [tabId]: { ...(prev[tabId] ?? sm), busy: "login", modalError: "" }
    }));

    const savePasswordWithTyped = !!(draft.savePassword && pwd);
    const profileSavePayload = savePasswordWithTyped
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

    const result = await connectRemoteTabFromFields(tabId, {
      profileId: draft.id ?? null,
      profileSavePayload,
      savePasswordWithTyped,
      host,
      port,
      username,
      authType: draft.authType,
      passwordTyped: pwd,
      hasStoredPassword: hasStored,
      defaultRemotePathTrimmed: draft.defaultRemotePath?.trim() || undefined,
      aliasForTitle
    });

    if (!result.ok) {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...(prev[tabId] ?? sm), busy: "idle", modalError: result.message }
      }));
      return;
    }

    closeSiteManagerForTab(tabId);
  }

  async function handleV12EmbeddedRemoteSubmit(tabId: string, payload: V12EmbeddedRemoteConnectSubmit): Promise<void> {
    void (await connectRemoteTabFromFields(tabId, payload));
  }

  async function handleSiteManagerSave(tabId: string): Promise<void> {
    const sm = siteManagerRef.current[tabId];
    if (!sm?.open) return;
    const { draft } = sm;
    setSiteManagerByTab((prev) => ({
      ...prev,
      [tabId]: { ...sm, busy: "save", modalError: "" }
    }));
    const res = await window.cofinder.profiles.save({
      ...draft,
      host: draft.host.trim(),
      username: draft.username.trim(),
      defaultRemotePath: draft.defaultRemotePath?.trim() || undefined
    });
    if (!res.ok) {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...(prev[tabId] ?? sm), busy: "idle", modalError: res.error.message }
      }));
      return;
    }
    const saved = res.data;
    await refreshSiteManagerForTab(tabId);
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur) return prev;
      return {
        ...prev,
        [tabId]: {
          ...cur,
          busy: "idle",
          selectedProfileId: saved.id,
          draft: profileToDraft(saved),
          passwordDirty: false,
          modalError: ""
        }
      };
    });
    void refreshV12EmbeddedRemoteCatalog();
  }

  function handleSiteManagerNew(tabId: string): void {
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur) return prev;
      return {
        ...prev,
        [tabId]: {
          ...cur,
          selectedProfileId: null,
          draft: emptyProfileDraft(),
          passwordDirty: false,
          modalError: ""
        }
      };
    });
  }

  function handleSiteManagerDuplicate(tabId: string): void {
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur?.draft.id) return prev;
      const d = cur.draft;
      const baseAlias = (d.alias || d.username || "Site").trim();
      return {
        ...prev,
        [tabId]: {
          ...cur,
          selectedProfileId: null,
          passwordDirty: false,
          modalError: "",
          draft: {
            ...emptyProfileDraft(),
            alias: `${baseAlias} copy`,
            host: d.host,
            port: d.port,
            username: d.username,
            defaultRemotePath: d.defaultRemotePath ?? "",
            authType: "password",
            savePassword: false,
            password: ""
          }
        }
      };
    });
  }

  function handleSiteManagerSelectProfile(tabId: string, profile: ServerProfile): void {
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur) return prev;
      return {
        ...prev,
        [tabId]: {
          ...cur,
          selectedProfileId: profile.id,
          draft: profileToDraft(profile),
          passwordDirty: false,
          modalError: ""
        }
      };
    });
  }

  function patchSiteManagerDraft(tabId: string, patch: Partial<ProfileUpsertPayload>): void {
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur) return prev;
      return { ...prev, [tabId]: { ...cur, draft: { ...cur.draft, ...patch } } };
    });
  }

  function setSiteManagerPasswordInput(tabId: string, value: string): void {
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur) return prev;
      return { ...prev, [tabId]: { ...cur, draft: { ...cur.draft, password: value }, passwordDirty: true } };
    });
  }

  async function handleSiteManagerDelete(tabId: string): Promise<void> {
    const sm = siteManagerRef.current[tabId];
    if (!sm?.open || !sm.draft.id) return;
    if (!window.confirm("Delete this saved site and its stored password?")) return;
    setSiteManagerByTab((prev) => ({
      ...prev,
      [tabId]: { ...sm, busy: "delete", modalError: "" }
    }));
    const res = await window.cofinder.profiles.delete({ id: sm.draft.id });
    if (!res.ok) {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...(prev[tabId] ?? sm), busy: "idle", modalError: res.error.message }
      }));
      return;
    }
    await refreshSiteManagerForTab(tabId);
    setSiteManagerByTab((prev) => {
      const cur = prev[tabId];
      if (!cur) return prev;
      return {
        ...prev,
        [tabId]: {
          ...cur,
          busy: "idle",
          selectedProfileId: null,
          draft: emptyProfileDraft(),
          passwordDirty: false,
          modalError: ""
        }
      };
    });
    void refreshV12EmbeddedRemoteCatalog();
  }

  async function listRemotePath(
    connectionId: string,
    targetPath: string,
    mode: "push" | "replace" | "back" | "forward" = "push",
    tabId: string = activeTabId
  ): Promise<boolean> {
    const previousPath = tabs.find((tab) => tab.id === tabId)?.remotePane.currentPath ?? "";
    const result = await window.cofinder.remote.listDirectory({
      connectionId,
      path: targetPath
    });
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id !== tabId ||
          (tab.remotePane.connectionId !== connectionId && tab.remotePane.connectionStatus !== "connecting")
            ? tab
            : {
                ...tab,
                remotePane: {
                  ...tab.remotePane,
                  error: result.error.message,
                  pathInput: previousPath || targetPath
                }
              }
        )
      );
      return false;
    }

    const payload = result.data;
    setTabs((prev) =>
      prev.map((tab) => {
        if (
          tab.id !== tabId ||
          (tab.remotePane.connectionId !== connectionId && tab.remotePane.connectionStatus !== "connecting")
        ) {
          return tab;
        }
        return {
          ...tab,
          remotePane: {
            ...tab.remotePane,
            error: "",
            entries: payload.entries,
            currentPath: payload.path,
            pathInput: payload.path,
            selectedFullPaths: [],
            selectionAnchorFullPath: null,
            history: computeHistory(tab.remotePane.history, mode, previousPath, payload.path)
          }
        };
      })
    );
    const profileId = tabs.find((tab) => tab.id === tabId)?.remotePane.activeProfileId;
    rememberRemoteRecent(profileId, payload.path);
    return true;
  }

  async function handleRemoteDoubleClick(tabId: string, entry: RemoteFileEntry): Promise<void> {
    if (uiShell === "v12") {
      cancelV12RemoteInspRevealTimer();
      setV12RemoteInspectorReveal(false);
    }
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (entry.type === "directory") {
      if (tab.remotePane.connectionId) await listRemotePath(tab.remotePane.connectionId, entry.fullPath, "push", tabId);
      return;
    }
    await previewRemotePath(tabId, entry.fullPath);
  }

  async function enqueueUpload(tabId: string, options?: { localSources?: string[]; remoteDestinationDir?: string }): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const selected = options?.localSources ?? tab.localPane.selectedFullPaths;
    if (selected.length === 0) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, localPane: { ...item.localPane, error: "Select a local file or folder first." } } : item
        )
      );
      return;
    }
    if (!tab.remotePane.connectionId) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, localPane: { ...item.localPane, error: "Connect to a remote server first." } } : item
        )
      );
      return;
    }
    if (!tab.remotePane.host || !tab.remotePane.username || !tab.remotePane.port) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId
            ? { ...item, localPane: { ...item.localPane, error: "Missing connection metadata for rsync transfer." } }
            : item
        )
      );
      return;
    }

    const payload: EnqueueUploadRequest = {
      tabId,
      profileId: tab.remotePane.activeProfileId ?? undefined,
      connectionId: tab.remotePane.connectionId,
      host: tab.remotePane.host,
      port: tab.remotePane.port,
      username: tab.remotePane.username,
      authType: tab.remotePane.authType,
      localSources: selected,
      remoteDestinationDir: options?.remoteDestinationDir ?? tab.remotePane.currentPath,
      preserveTimestamps: appSettings.transfer.preserveTimestamps
    };
    const checked = await resolveTransferConflicts("upload", payload);
    if (!checked) return;
    const result = await window.cofinder.transfer.enqueueUpload(checked as EnqueueUploadRequest);
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item
        )
      );
      return;
    }
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId ? { ...item, localPane: { ...item.localPane, error: "" }, remotePane: { ...item.remotePane, error: "" } } : item
      )
    );
    setQueuePanelState((prev) => (prev === "hidden" ? "expanded" : prev));
  }

  async function enqueueDownload(tabId: string, options?: { remoteSources?: string[]; localDestinationDir?: string }): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const selected = options?.remoteSources ?? tab.remotePane.selectedFullPaths;
    if (selected.length === 0) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "Select a remote file or folder first." } } : item
        )
      );
      return;
    }
    if (!tab.localPane.currentPath) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "Select a local destination first." } } : item
        )
      );
      return;
    }
    if (!tab.remotePane.connectionId || !tab.remotePane.host || !tab.remotePane.username || !tab.remotePane.port) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "Missing connection metadata for rsync transfer." } } : item
        )
      );
      return;
    }

    const payload: EnqueueDownloadRequest = {
      tabId,
      profileId: tab.remotePane.activeProfileId ?? undefined,
      connectionId: tab.remotePane.connectionId,
      host: tab.remotePane.host,
      port: tab.remotePane.port,
      username: tab.remotePane.username,
      authType: tab.remotePane.authType,
      remoteSources: selected,
      localDestinationDir: options?.localDestinationDir ?? tab.localPane.currentPath,
      preserveTimestamps: appSettings.transfer.preserveTimestamps
    };
    const checked = await resolveTransferConflicts("download", payload);
    if (!checked) return;
    const result = await window.cofinder.transfer.enqueueDownload(checked as EnqueueDownloadRequest);
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item
        )
      );
      return;
    }
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "" }, localPane: { ...item.localPane, error: "" } } : item
      )
    );
    setQueuePanelState((prev) => (prev === "hidden" ? "expanded" : prev));
  }

  function updatePaneSelection(tabId: string, pane: ActivePane, selection: SelectionState): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id !== tabId
          ? tab
          : pane === "local"
            ? { ...tab, localPane: { ...tab.localPane, ...selection } }
            : { ...tab, remotePane: { ...tab.remotePane, ...selection } }
      )
    );
  }

  function setPaneError(tabId: string, pane: ActivePane, message: string): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id !== tabId
          ? tab
          : pane === "local"
            ? { ...tab, localPane: { ...tab.localPane, error: message } }
            : { ...tab, remotePane: { ...tab.remotePane, error: message } }
      )
    );
  }

  function beginTransferDrag(pane: ActivePane, entry: LocalFileEntry | RemoteFileEntry, event: ReactDragEvent<HTMLElement>): void {
    const tab = tabs.find((item) => item.id === activeTab.id);
    if (!tab) return;
    const paneState = pane === "local" ? tab.localPane : tab.remotePane;
    const paths = paneState.selectedFullPaths.includes(entry.fullPath) ? paneState.selectedFullPaths : [entry.fullPath];
    if (!paneState.selectedFullPaths.includes(entry.fullPath)) {
      updatePaneSelection(activeTab.id, pane, { selectedFullPaths: [entry.fullPath], selectionAnchorFullPath: entry.fullPath });
    }
    const payload: TransferDragPayload = { kind: "cofinder-transfer", pane, tabId: activeTab.id, paths };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(COFINDER_TRANSFER_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", paths.join("\n"));
  }

  function parseTransferDrag(event: ReactDragEvent<HTMLElement>): TransferDragPayload | null {
    const raw = event.dataTransfer.getData(COFINDER_TRANSFER_MIME);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw) as Partial<TransferDragPayload>;
      if (
        payload.kind === "cofinder-transfer" &&
        (payload.pane === "local" || payload.pane === "remote") &&
        typeof payload.tabId === "string" &&
        Array.isArray(payload.paths) &&
        payload.paths.every((path) => typeof path === "string")
      ) {
        return payload as TransferDragPayload;
      }
    } catch {
      return null;
    }
    return null;
  }

  function finderDropPaths(event: ReactDragEvent<HTMLElement>): string[] {
    return Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path ?? "")
      .filter(Boolean);
  }

  function hasFinderFiles(event: ReactDragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function canDropOnPane(targetPane: ActivePane, event: ReactDragEvent<HTMLElement>): boolean {
    const payload = parseTransferDrag(event);
    if (targetPane === "remote") {
      return !!remotePane.connectionId && ((payload?.pane === "local" && payload.tabId === activeTab.id) || hasFinderFiles(event));
    }
    return !!localPane.currentPath && payload?.pane === "remote" && payload.tabId === activeTab.id;
  }

  function handleTransferDragOver(
    targetPane: ActivePane,
    targetPath: string,
    event: ReactDragEvent<HTMLElement>,
    options?: { requireDirectory?: boolean; entryType?: string }
  ): void {
    const rowValid = !options?.requireDirectory || options.entryType === "directory";
    const valid = rowValid && canDropOnPane(targetPane, event);
    event.preventDefault();
    event.dataTransfer.dropEffect = valid ? "copy" : "none";
    setDropTarget({ pane: targetPane, path: targetPath, valid });
  }

  async function handleTransferDrop(targetPane: ActivePane, targetPath: string, event: ReactDragEvent<HTMLElement>): Promise<void> {
    event.preventDefault();
    const payload = parseTransferDrag(event);
    const finderPaths = finderDropPaths(event);
    setDropTarget(null);

    if (targetPane === "remote") {
      if (payload?.pane === "local" && payload.tabId === activeTab.id) {
        await enqueueUpload(activeTab.id, { localSources: payload.paths, remoteDestinationDir: targetPath });
        return;
      }
      if (finderPaths.length > 0) {
        await enqueueUpload(activeTab.id, { localSources: finderPaths, remoteDestinationDir: targetPath });
        return;
      }
      setPaneError(activeTab.id, "remote", "Drop local files here to upload.");
      return;
    }

    if (payload?.pane === "remote" && payload.tabId === activeTab.id) {
      await enqueueDownload(activeTab.id, { remoteSources: payload.paths, localDestinationDir: targetPath });
      return;
    }
    setPaneError(activeTab.id, "local", "Drop remote files here to download.");
  }

  function handleDirectoryRowDragOver(
    targetPane: ActivePane,
    entry: LocalFileEntry | RemoteFileEntry,
    event: ReactDragEvent<HTMLElement>
  ): void {
    event.stopPropagation();
    handleTransferDragOver(targetPane, entry.fullPath, event, { requireDirectory: true, entryType: entry.type });
  }

  async function handleDirectoryRowDrop(
    targetPane: ActivePane,
    entry: LocalFileEntry | RemoteFileEntry,
    event: ReactDragEvent<HTMLElement>
  ): Promise<void> {
    event.stopPropagation();
    if (entry.type !== "directory") {
      event.preventDefault();
      setDropTarget(null);
      setPaneError(activeTab.id, targetPane, "Drop onto a folder or empty pane area.");
      return;
    }
    await handleTransferDrop(targetPane, entry.fullPath, event);
  }

  function handleTransferDragLeave(event: ReactDragEvent<HTMLElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
  }

  function rowDropClass(pane: ActivePane, path: string): string {
    if (!dropTarget || dropTarget.pane !== pane || dropTarget.path !== path) return "";
    return dropTarget.valid ? "drop-target-valid" : "drop-target-invalid";
  }

  function beginMarqueeSelection(pane: ActivePane, event: ReactMouseEvent<HTMLElement>): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-pane-row],button,input,textarea,select")) return;
    const tab = tabs.find((item) => item.id === activeTab.id);
    if (!tab) return;
    const baseSelection =
      pane === "local"
        ? { selectedFullPaths: tab.localPane.selectedFullPaths, selectionAnchorFullPath: tab.localPane.selectionAnchorFullPath }
        : { selectedFullPaths: tab.remotePane.selectedFullPaths, selectionAnchorFullPath: tab.remotePane.selectionAnchorFullPath };
    event.preventDefault();
    setActivePane(pane);
    setMarquee({
      pane,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: event.metaKey || event.shiftKey,
      baseSelection
    });
    if (!event.metaKey && !event.shiftKey) updatePaneSelection(activeTab.id, pane, clearSelectionState());
  }

  function handleLocalRowClick(
    tabId: string,
    entry: LocalFileEntry,
    event: { metaKey: boolean; shiftKey: boolean; clickDetail?: number }
  ): void {
    setActivePane("local");
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          localPane: {
            ...tab.localPane,
            ...applyRowSelection(
              tab.localPane.entries,
              {
                selectedFullPaths: tab.localPane.selectedFullPaths,
                selectionAnchorFullPath: tab.localPane.selectionAnchorFullPath
              },
              entry.fullPath,
              event
            )
          }
        };
      })
    );
    if (uiShell === "v12") {
      const d = event.clickDetail ?? 1;
      if (d >= 2) {
        cancelV12LocalInspRevealTimer();
        setV12LocalInspectorReveal(false);
      } else {
        scheduleV12LocalInspRevealFromRowClick();
      }
    }
  }

  function handleRemoteRowClick(
    tabId: string,
    entry: RemoteFileEntry,
    event: { metaKey: boolean; shiftKey: boolean; clickDetail?: number }
  ): void {
    setActivePane("remote");
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          remotePane: {
            ...tab.remotePane,
            ...applyRowSelection(
              tab.remotePane.entries,
              {
                selectedFullPaths: tab.remotePane.selectedFullPaths,
                selectionAnchorFullPath: tab.remotePane.selectionAnchorFullPath
              },
              entry.fullPath,
              event
            )
          }
        };
      })
    );
    if (uiShell === "v12") {
      const d = event.clickDetail ?? 1;
      if (d >= 2) {
        cancelV12RemoteInspRevealTimer();
        setV12RemoteInspectorReveal(false);
      } else {
        scheduleV12RemoteInspRevealFromRowClick();
      }
    }
  }

  function clearLocalSelection(tabId: string): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              localPane: {
                ...tab.localPane,
                ...clearSelectionState()
              }
            }
          : tab
      )
    );
  }

  function clearRemoteSelection(tabId: string): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              remotePane: {
                ...tab.remotePane,
                ...clearSelectionState()
              }
            }
          : tab
      )
    );
  }

  function openContextMenu(
    tabId: string,
    pane: "local" | "remote",
    entryPath: string,
    event: { clientX: number; clientY: number }
  ): void {
    setActivePane(pane);
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        if (pane === "local") {
          const nextSelected = normalizeContextSelection(tab.localPane.selectedFullPaths, entryPath);
          return {
            ...tab,
            localPane: {
              ...tab.localPane,
              selectedFullPaths: nextSelected,
              selectionAnchorFullPath: entryPath
            }
          };
        }
        const nextSelected = normalizeContextSelection(tab.remotePane.selectedFullPaths, entryPath);
        return {
          ...tab,
          remotePane: {
            ...tab.remotePane,
            selectedFullPaths: nextSelected,
            selectionAnchorFullPath: entryPath
          }
        };
      })
    );
    setContextMenu({ pane, tabId, x: event.clientX, y: event.clientY });
  }

  function shouldStartInlineRenameFromClick(
    pane: "local" | "remote",
    tabId: string,
    entryPath: string,
    selectedFullPaths: string[],
    event: { metaKey: boolean; shiftKey: boolean }
  ): boolean {
    if (event.metaKey || event.shiftKey) return false;
    if (inlineRename) return false;
    if (selectedFullPaths.length !== 1 || selectedFullPaths[0] !== entryPath) return false;
    const last = lastPlainClickRef.current;
    if (!last) return false;
    if (last.pane !== pane || last.tabId !== tabId || last.path !== entryPath) return false;
    const elapsed = Date.now() - last.at;
    return elapsed >= INLINE_RENAME_CLICK_MIN_MS && elapsed <= INLINE_RENAME_CLICK_MAX_MS;
  }

  async function copySelection(tabId: string, pane: "local" | "remote", mode: "name" | "path"): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const text =
      pane === "local"
        ? stringifySelection(tab.localPane.selectedFullPaths, tab.localPane.entries, mode)
        : stringifySelection(tab.remotePane.selectedFullPaths, tab.remotePane.entries, mode);
    if (!text) return;
    const result = await window.cofinder.system.copyText({ text });
    if (!result.ok) setQueueError(result.error.message);
  }

  async function renameLocalSelection(tabId: string, targetPath: string, nextName: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const result = await window.cofinder.local.rename({ path: targetPath, newName: nextName });
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item
        )
      );
      return;
    }

    await navigateLocal(tabId, tab.localPane.currentPath, "replace");
    setTabs((prev) =>
      prev.map((item) =>
        item.id !== tabId
          ? item
          : {
              ...item,
              localPane: {
                ...item.localPane,
                error: "",
                selectedFullPaths: [result.data.newPath],
                selectionAnchorFullPath: result.data.newPath
              }
            }
      )
    );
  }

  async function renameRemoteSelection(tabId: string, connectionId: string, targetPath: string, nextName: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const result = await window.cofinder.remote.rename({
      connectionId,
      path: targetPath,
      newName: nextName
    });
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item
        )
      );
      return;
    }

    await listRemotePath(connectionId, tab.remotePane.currentPath, "replace", tabId);
    setTabs((prev) =>
      prev.map((item) =>
        item.id !== tabId
          ? item
          : {
              ...item,
              remotePane: {
                ...item.remotePane,
                error: "",
                selectedFullPaths: [result.data.newPath],
                selectionAnchorFullPath: result.data.newPath
              }
            }
      )
    );
  }

  function openInlineRename(tabId: string, pane: "local" | "remote"): void {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "local") {
      if (tab.localPane.selectedFullPaths.length !== 1) return;
      const sourcePath = tab.localPane.selectedFullPaths[0];
      const currentName = getEntryNameFromPath(sourcePath);
      setInlineRename({
        pane,
        tabId,
        connectionId: null,
        sourcePath,
        currentName,
        draftName: currentName
      });
      return;
    }
    if (!tab.remotePane.connectionId || tab.remotePane.selectedFullPaths.length !== 1) return;
    const sourcePath = tab.remotePane.selectedFullPaths[0];
    const currentName = getEntryNameFromPath(sourcePath);
    setInlineRename({
      pane,
      tabId,
      connectionId: tab.remotePane.connectionId,
      sourcePath,
      currentName,
      draftName: currentName
    });
  }

  async function submitInlineRename(): Promise<void> {
    if (!inlineRename) return;
    const trimmedName = inlineRename.draftName.trim();
    if (!trimmedName) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id !== inlineRename.tabId
            ? item
            : inlineRename.pane === "local"
              ? { ...item, localPane: { ...item.localPane, error: "New name is required." } }
              : { ...item, remotePane: { ...item.remotePane, error: "New name is required." } }
        )
      );
      return;
    }
    if (trimmedName === inlineRename.currentName) {
      setInlineRename(null);
      return;
    }

    if (inlineRename.pane === "local") {
      await renameLocalSelection(inlineRename.tabId, inlineRename.sourcePath, trimmedName);
      setInlineRename(null);
      return;
    }
    if (!inlineRename.connectionId) return;
    await renameRemoteSelection(inlineRename.tabId, inlineRename.connectionId, inlineRename.sourcePath, trimmedName);
    setInlineRename(null);
  }

  function openDeleteConfirm(tabId: string, pane: "local" | "remote"): void {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "local") {
      const paths = tab.localPane.selectedFullPaths;
      if (paths.length === 0) return;
      const entryMap = new Map(tab.localPane.entries.map((entry) => [entry.fullPath, entry.name]));
      const names = paths.map((fullPath) => entryMap.get(fullPath) ?? getEntryNameFromPath(fullPath));
      const next = {
        pane,
        tabId,
        connectionId: null,
        paths,
        names
      };
      if (!appSettings.general.confirmBeforeDelete) {
        void performDelete(next);
        return;
      }
      setDeleteConfirm(next);
      return;
    }

    if (!tab.remotePane.connectionId) return;
    const paths = tab.remotePane.selectedFullPaths;
    if (paths.length === 0) return;
    const entryMap = new Map(tab.remotePane.entries.map((entry) => [entry.fullPath, entry.name]));
    const names = paths.map((fullPath) => entryMap.get(fullPath) ?? getEntryNameFromPath(fullPath));
    const next = {
      pane,
      tabId,
      connectionId: tab.remotePane.connectionId,
      paths,
      names
    };
    if (!appSettings.general.confirmBeforeDelete) {
      void performDelete(next);
      return;
    }
    setDeleteConfirm(next);
  }

  async function submitDeleteConfirm(): Promise<void> {
    if (!deleteConfirm) return;
    await performDelete(deleteConfirm);
  }

  async function performDelete(target: DeleteConfirmState): Promise<void> {
    if (target.pane === "local") {
      const tab = tabs.find((item) => item.id === target.tabId);
      if (!tab) return;
      const result = await window.cofinder.local.delete({ paths: target.paths });
      if (!result.ok) {
        setTabs((prev) =>
          prev.map((item) =>
            item.id === target.tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item
          )
        );
        return;
      }
      await navigateLocal(target.tabId, tab.localPane.currentPath, "replace");
      setDeleteConfirm(null);
      return;
    }

    if (!target.connectionId) return;
    const tab = tabs.find((item) => item.id === target.tabId);
    if (!tab) return;
    const result = await window.cofinder.remote.delete({
      connectionId: target.connectionId,
      paths: target.paths
    });
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === target.tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item
        )
      );
      return;
    }
    await listRemotePath(target.connectionId, tab.remotePane.currentPath, "replace", target.tabId);
    setDeleteConfirm(null);
  }

  async function openInfoDialog(tabId: string, pane: "local" | "remote"): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const token = ++infoRequestTokenRef.current;
    if (pane === "local") {
      const targetPath = tab.localPane.selectedFullPaths[0];
      if (!targetPath || tab.localPane.selectedFullPaths.length !== 1) return;
      const result = await window.cofinder.local.getInfo({ path: targetPath, includeDirectorySize: false });
      if (!result.ok) {
        setTabs((prev) =>
          prev.map((item) =>
            item.id === tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item
          )
        );
        return;
      }
      const shouldLoadSize = result.data.info.type === "directory";
      setInfoDialog({
        pane: "local",
        info: result.data.info,
        isSizeLoading: shouldLoadSize
      });
      if (shouldLoadSize) {
        void (async () => {
          const sizeRes = await window.cofinder.local.getInfo({ path: targetPath, includeDirectorySize: true });
          if (!sizeRes.ok) return;
          setInfoDialog((prev) => {
            if (!prev || infoRequestTokenRef.current !== token) return prev;
            return {
              ...prev,
              info: { ...prev.info, size: sizeRes.data.info.size },
              isSizeLoading: false
            };
          });
        })();
      }
      return;
    }

    const targetPath = tab.remotePane.selectedFullPaths[0];
    if (!targetPath || tab.remotePane.selectedFullPaths.length !== 1 || !tab.remotePane.connectionId) return;
    const result = await window.cofinder.remote.getInfo({
      connectionId: tab.remotePane.connectionId,
      path: targetPath,
      includeDirectorySize: false
    });
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item
        )
      );
      return;
    }
    const shouldLoadSize = result.data.info.type === "directory";
    setInfoDialog({
      pane: "remote",
      info: result.data.info,
      isSizeLoading: shouldLoadSize
    });
    if (shouldLoadSize) {
      const connectionId = tab.remotePane.connectionId;
      void (async () => {
        const sizeRes = await window.cofinder.remote.getInfo({
          connectionId,
          path: targetPath,
          includeDirectorySize: true
        });
        if (!sizeRes.ok) return;
        setInfoDialog((prev) => {
          if (!prev || infoRequestTokenRef.current !== token) return prev;
          return {
            ...prev,
            info: { ...prev.info, size: sizeRes.data.info.size },
            isSizeLoading: false
          };
        });
      })();
    }
  }

  async function quickLookSelection(tabId: string, pane: "local" | "remote"): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "remote") {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId
            ? {
                ...item,
                remotePane: {
                  ...item.remotePane,
                  error: "Remote Quick Look is not implemented yet. Double-click a remote file or use Open for read-only preview."
                }
              }
            : item
        )
      );
      return;
    }
    const selected = tab.localPane.selectedFullPaths;
    if (selected.length !== 1) return;
    const result = await window.cofinder.system.quickLook({ path: selected[0] });
    if (!result.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item
        )
      );
      return;
    }
    setTabs((prev) =>
      prev.map((item) => (item.id === tabId ? { ...item, localPane: { ...item.localPane, error: "" } } : item))
    );
  }

  async function disconnectRemote(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.remotePane.connectionId) return;
    await window.cofinder.remote.previewClearForTab({ tabId });
    await window.cofinder.remote.disconnect({ connectionId: tab.remotePane.connectionId });
    setTabs((prev) =>
      prev.map((item) => {
        if (item.id !== tabId) return item;
        return {
          ...item,
          title: `Tab ${getTabNumber(item.id, prev)}`,
          remotePane: createRemotePaneState()
        };
      })
    );
  }

  function createTab(): void {
    const id = createId();
    setTabs((prev) => [...prev, createTabState(id, prev.length + 1)]);
    setActiveTabId(id);
    if (localHomePath) void navigateLocal(id, localHomePath, "replace");
    else void initializeLocalHome(id);
  }

  async function closeTab(tabId: string): Promise<void> {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    const closing = tabs[closingIndex];
    if (!closing) return;
    if (closing.remotePane.connectionId) {
      await window.cofinder.remote.previewClearForTab({ tabId });
      await window.cofinder.remote.disconnect({ connectionId: closing.remotePane.connectionId });
    }

    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== tabId);
      if (next.length === 0) {
        const newId = createId();
        if (localHomePath) void navigateLocal(newId, localHomePath, "replace");
        else void initializeLocalHome(newId);
        setActiveTabId(newId);
        return [createTabState(newId, 1)];
      }
      if (activeTabId === tabId) {
        const fallback = next[Math.max(0, closingIndex - 1)];
        if (fallback) setActiveTabId(fallback.id);
      }
      return next;
    });
    setSiteManagerByTab((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
  }

  const activeSiteManager = siteManagerByTab[activeTab.id];

  const tabBar = (
    <TabBar
      tabs={tabs}
      activeTabId={activeTabId}
      onSelect={setActiveTabId}
      onAdd={createTab}
      onClose={(tabId) => void closeTab(tabId)}
      onMove={(draggedId, targetId) => {
        setTabs((prev) => {
          const draggedIndex = prev.findIndex((tab) => tab.id === draggedId);
          const targetIndex = prev.findIndex((tab) => tab.id === targetId);
          if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return prev;
          const next = [...prev];
          const [dragged] = next.splice(draggedIndex, 1);
          next.splice(targetIndex, 0, dragged);
          return next;
        });
      }}
    />
  );

  const localPaneSectionClass =
    uiShell === "v12" ? `v12m-pane ${activePane === "local" ? "is-focus" : "is-blur"}` : `pane local-pane ${activePane === "local" ? "pane-active" : ""}`;
  const remotePaneSectionClass =
    uiShell === "v12" ? `v12m-pane ${activePane === "remote" ? "is-focus" : "is-blur"}` : `pane remote-pane ${activePane === "remote" ? "pane-active" : ""}`;

  const sm = siteManagerByTab[activeTab.id];
  const activeProfile =
    remotePane.activeProfileId
      ? v12EmbeddedRemoteCatalog.profiles.find((p) => p.id === remotePane.activeProfileId) ??
        sm?.profiles.find((p) => p.id === remotePane.activeProfileId) ??
        null
      : null;
  const activeProfileAlias = activeProfile?.alias?.trim() ?? null;
  const remoteRecentPaths = activeProfile?.id ? (remoteRecentPathsByProfile[activeProfile.id] ?? []) : [];
  const localPathSuggestions = buildPathSuggestions(localPane.pathInput, [
    localPane.currentPath,
    ...localPane.history.backStack.slice().reverse(),
    ...localPane.history.forwardStack,
    ...localRecentPaths.map((r) => r.path),
    ...v12LocalFavorites.map((f) => f.path)
  ]);
  const remotePathSuggestions = buildPathSuggestions(remotePane.pathInput, [
    remotePane.currentPath,
    ...remotePane.history.backStack.slice().reverse(),
    ...remotePane.history.forwardStack,
    ...remoteRecentPaths.map((r) => r.path),
    ...(activeProfile?.remoteFavorites ?? []).map((f) => f.path)
  ]);
  const localPaneTitleV12 = localPaneTitleFromPath(localPane.currentPath);
  const remotePaneTitleV12 = activeProfileAlias
    ? activeProfileAlias
    : remoteConnected
      ? `${remotePane.username}@${remotePane.host}`
      : "Remote";
  const remotePaneMetaV12 = remoteConnected
    ? `${remotePane.username}@${remotePane.host}:${remotePane.port}`
    : remotePane.connectionStatus === "connecting"
      ? "Connecting…"
      : remotePane.connectionStatus === "failed" && remotePane.error
        ? remotePane.error
        : "Offline";

  const remoteBadgeV12 =
    !remoteConnected && remotePane.connectionStatus !== "connecting" ? (
      <span className="v12m-badge v12m-badge-off">Offline</span>
    ) : remotePane.connectionStatus === "connecting" ? (
      <span className="v12m-badge v12m-badge-wait">Connecting…</span>
    ) : remotePane.connectionStatus === "failed" ? (
      <span className="v12m-badge v12m-badge-err">Error</span>
    ) : (
      <span className="v12m-badge v12m-badge-ok">
        <span className="v12m-badge-dot" aria-hidden />
        Connected
      </span>
    );

  function expandOrCollapseQueueFromV12Drawer(): void {
    if (queuePanelState === "hidden" || queuePanelState === "collapsed") setQueuePanelState("expanded");
    else if (queuePanelState === "expanded" || queuePanelState === "autoHidePending") setQueuePanelState("collapsed");
  }

  const localInspectorCanShow = inspectorColumnVisible("local", localPane.selectedFullPaths.length, remoteConnected);
  const remoteInspectorCanShow = inspectorColumnVisible("remote", remotePane.selectedFullPaths.length, remoteConnected);
  const v12InspectorToggleDisabled =
    activePane === "local"
      ? !localInspectorCanShow || localPane.selectedFullPaths.length === 0
      : !remoteInspectorCanShow || remotePane.selectedFullPaths.length === 0;
  const v12InspectorTogglePressed = activePane === "local" ? v12LocalInspectorReveal : v12RemoteInspectorReveal;

  const v12Toolbar =
    uiShell === "v12" ? (
      <V12Toolbar
        onBack={() => {
          if (activePane === "local") {
            const target = localPane.history.backStack[localPane.history.backStack.length - 1];
            if (target) void navigateLocal(activeTab.id, target, "back");
          } else {
            const target = remotePane.history.backStack[remotePane.history.backStack.length - 1];
            if (target && remotePane.connectionId) void listRemotePath(remotePane.connectionId, target, "back", activeTab.id);
          }
        }}
        onForward={() => {
          if (activePane === "local") {
            const target = localPane.history.forwardStack[0];
            if (target) void navigateLocal(activeTab.id, target, "forward");
          } else {
            const target = remotePane.history.forwardStack[0];
            if (target && remotePane.connectionId) void listRemotePath(remotePane.connectionId, target, "forward", activeTab.id);
          }
        }}
        onUp={() => {
          if (activePane === "local") {
            void navigateLocal(activeTab.id, getParentPath(localPane.currentPath));
          } else if (remotePane.connectionId) {
            void listRemotePath(remotePane.connectionId, getParentPath(remotePane.currentPath), "push", activeTab.id);
          }
        }}
        onRefresh={() => {
          if (activePane === "local") {
            if (localPane.currentPath) void navigateLocal(activeTab.id, localPane.currentPath, "replace");
          } else if (remotePane.connectionId) {
            void listRemotePath(remotePane.connectionId, remotePane.currentPath, "replace", activeTab.id);
          }
        }}
        backDisabled={
          activePane === "local"
            ? localPane.history.backStack.length === 0
            : remotePane.history.backStack.length === 0 || !remotePane.connectionId
        }
        forwardDisabled={
          activePane === "local"
            ? localPane.history.forwardStack.length === 0
            : remotePane.history.forwardStack.length === 0 || !remotePane.connectionId
        }
        upDisabled={activePane === "local" ? false : !remotePane.connectionId}
        refreshDisabled={activePane === "local" ? !localPane.currentPath : !remotePane.connectionId}
        onConnectAction={() => {
          if (remoteConnected) void disconnectRemote(activeTab.id);
          else openSiteManagerForTab(activeTab.id);
        }}
        connectActionDisabled={remotePane.connectionStatus === "connecting"}
        connectActionTitle={remoteConnected ? "Disconnect from server" : "Connect to server…"}
        connectActionAriaLabel={remoteConnected ? "Disconnect" : "Connect"}
        onUpload={() => void enqueueUpload(activeTab.id)}
        onDownload={() => void enqueueDownload(activeTab.id)}
        uploadDisabled={localPane.selectedFullPaths.length === 0 || !remotePane.connectionId}
        downloadDisabled={
          remotePane.selectedFullPaths.length === 0 || !localPane.currentPath || !remotePane.connectionId
        }
        onDelete={() => openDeleteConfirm(activeTab.id, activePane)}
        deleteDisabled={
          activePane === "local"
            ? localPane.selectedFullPaths.length === 0
            : remotePane.selectedFullPaths.length === 0
        }
        onGetInfo={() => void openInfoDialog(activeTab.id, activePane)}
        getInfoDisabled={
          activePane === "local"
            ? localPane.selectedFullPaths.length !== 1
            : remotePane.selectedFullPaths.length !== 1
        }
        onInspectorToggle={() => {
          if (activePane === "local") {
            cancelV12LocalInspRevealTimer();
            setV12LocalInspectorReveal((v) => !v);
          } else {
            cancelV12RemoteInspRevealTimer();
            setV12RemoteInspectorReveal((v) => !v);
          }
        }}
        inspectorToggleDisabled={v12InspectorToggleDisabled}
        inspectorTogglePressed={v12InspectorTogglePressed}
        onPreferences={openPreferences}
        searchValue={activePane === "local" ? localPane.filterText : remotePane.filterText}
        searchPlaceholder={`Filter ${activePane}`}
        onSearchChange={(value) =>
          activePane === "local" ? updateLocalFilter(activeTab.id, value) : updateRemoteFilter(activeTab.id, value)
        }
      />
    ) : null;

  const queueExpandedBody = (
    <>
      <div className="queue-header">
        <div>
          <strong>Transfer Queue</strong>
          <span className="queue-summary">{summarizeQueue()}</span>
        </div>
        <div className="queue-controls">
          {queueStats.failedCount > 0 ? (
            <button type="button" className="toolbar-button" onClick={() => void retryFailedTransfers()}>
              Retry failed
            </button>
          ) : null}
          <button type="button" className="toolbar-button" onClick={() => setQueuePanelState("collapsed")}>
            Minimize
          </button>
          <button
            type="button"
            className={`toolbar-button ${queuePinned ? "is-active" : ""}`}
            onClick={() => setQueuePinned((prev) => !prev)}
          >
            {queuePinned ? "Pinned" : "Pin"}
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              void clearCompletedTransfers();
            }}
          >
            Clear
          </button>
        </div>
      </div>
      {queueError ? <div className="error-banner">{queueError}</div> : null}
      <div className="queue-list">
        {transferTasks.length === 0 ? (
          <div className="queue-empty">No transfer tasks.</div>
        ) : (
          transferTasks.map((task) => (
            <div key={task.id} className="queue-item">
              <span>{task.direction}</span>
              <span className={`queue-status status-${task.status}`}>{task.status}</span>
              <span className="queue-path" title={`${task.sourceDisplay} -> ${task.destinationDisplay}`}>
                {task.sourceDisplay} {"->"} {task.destinationDisplay}
              </span>
              <span className="queue-path" title={task.progressText ?? task.currentFile ?? "-"}>
                {task.progressText ?? task.currentFile ?? "-"}
                {task.speed ? ` | ${task.speed}` : ""}
                {task.eta ? ` | ETA ${task.eta}` : ""}
              </span>
              <span>
                {task.status === "pending" ? (
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={async () => {
                      const res = await window.cofinder.transfer.cancel({ taskId: task.id });
                      if (!res.ok) setQueueError(res.error.message);
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
                {task.status === "running" ? (
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={async () => {
                      const res = await window.cofinder.transfer.stop({ taskId: task.id });
                      if (!res.ok) setQueueError(res.error.message);
                    }}
                  >
                    Stop
                  </button>
                ) : null}
                {task.status === "failed" ? (
                  <>
                    <button type="button" className="toolbar-button" onClick={() => void retryTransferTask(task.id)}>
                      Retry
                    </button>
                    <button type="button" className="toolbar-button" onClick={() => void copyTransferError(task.id)}>
                      Copy error
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
      {queuePanelState === "autoHidePending" ? (
        <div className="queue-footnote">All tasks completed. Auto-hiding in 10 seconds.</div>
      ) : null}
    </>
  );

  const queueV11Section =
    queuePanelState !== "hidden" ? (
      <section className="queue-area">
        {queuePanelState === "collapsed" ? (
          <button
            type="button"
            className="queue-collapsed-bar"
            onClick={() => setQueuePanelState("expanded")}
            title="Expand transfer queue"
          >
            <span>Transfer Queue</span>
            <span>{summarizeQueue()}</span>
          </button>
        ) : (
          <div className="queue-panel">{queueExpandedBody}</div>
        )}
      </section>
    ) : null;

  const queueV12Drawer = (
    <V12TransferDrawer
      state={queuePanelState}
      pinned={queuePinned}
      error={queueError}
      tasks={transferTasks}
      summary={summarizeQueue()}
      onToggleExpand={() => expandOrCollapseQueueFromV12Drawer()}
      onTogglePin={() => setQueuePinned((prev) => !prev)}
      onClearCompleted={() => void clearCompletedTransfers()}
      onCancelTask={async (taskId) => {
        const res = await window.cofinder.transfer.cancel({ taskId });
        if (!res.ok) setQueueError(res.error.message);
      }}
      onStopTask={async (taskId) => {
        const res = await window.cofinder.transfer.stop({ taskId });
        if (!res.ok) setQueueError(res.error.message);
      }}
      onRetryTask={(taskId) => retryTransferTask(taskId)}
      onRetryFailed={() => retryFailedTransfers()}
      onCopyError={(taskId) => copyTransferError(taskId)}
    />
  );

  async function resolveTransferConflicts(
    direction: "upload" | "download",
    request: EnqueueUploadRequest | EnqueueDownloadRequest
  ): Promise<EnqueueUploadRequest | EnqueueDownloadRequest | null> {
    const result =
      direction === "upload"
        ? await window.cofinder.transfer.checkUploadConflicts(request as EnqueueUploadRequest)
        : await window.cofinder.transfer.checkDownloadConflicts(request as EnqueueDownloadRequest);
    if (!result.ok) {
      setQueueError(result.error.message);
      return null;
    }
    if (result.data.conflicts.length === 0) return { ...request, conflictPolicy: "prompt" };
    const policy =
      appSettings.transfer.defaultConflictPolicy === "prompt"
        ? promptForConflictPolicy(result.data.conflicts)
        : appSettings.transfer.defaultConflictPolicy;
    if (policy === "cancel") return null;
    if (policy === "skip") {
      const conflictSources = new Set(result.data.conflicts.map((c) => c.source));
      if (direction === "upload") {
        const upload = request as EnqueueUploadRequest;
        const localSources = upload.localSources.filter((source) => !conflictSources.has(source));
        if (localSources.length === 0) return null;
        return { ...upload, localSources, conflictPolicy: "skip" };
      }
      const download = request as EnqueueDownloadRequest;
      const remoteSources = download.remoteSources.filter((source) => !conflictSources.has(source));
      if (remoteSources.length === 0) return null;
      return { ...download, remoteSources, conflictPolicy: "skip" };
    }
    return { ...request, conflictPolicy: policy };
  }

  function persistV12PaneRatio(next: number): void {
    const clamped = Math.max(0.25, Math.min(0.75, next));
    setV12PaneRatio(clamped);
    window.localStorage.setItem("cofinder.v12PaneRatio", String(clamped));
  }

  function beginV12PaneResize(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const split = event.currentTarget.parentElement;
    if (!split) return;
    const rect = split.getBoundingClientRect();
    const onMove = (moveEvent: MouseEvent) => {
      persistV12PaneRatio((moveEvent.clientX - rect.left) / rect.width);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function previewRemoteSelection(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    const target = tab?.remotePane.selectedFullPaths[0];
    if (!tab?.remotePane.connectionId || !target || tab.remotePane.selectedFullPaths.length !== 1) return;
    await previewRemotePath(tabId, target);
  }

  async function previewRemotePath(tabId: string, remotePath: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.remotePane.connectionId) return;
    const res = await window.cofinder.remote.previewOpen({
      tabId,
      connectionId: tab.remotePane.connectionId,
      path: remotePath
    });
    if (!res.ok) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: res.error.message } } : item
        )
      );
      return;
    }
    setTabs((prev) =>
      prev.map((item) => (item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "" } } : item))
    );
  }

  async function handleV12AddRemoteFavorite(): Promise<void> {
    if (!activeProfile?.id || !remotePane.currentPath) return;
    const res = await window.cofinder.profiles.addRemoteFavorite({ profileId: activeProfile.id, path: remotePane.currentPath });
    if (!res.ok) {
      showV12FavoriteHint(res.error.message);
      return;
    }
    await refreshV12EmbeddedRemoteCatalog();
  }

  async function handleV12RemoveRemoteFavorite(favoriteId: string): Promise<void> {
    if (!activeProfile?.id) return;
    const res = await window.cofinder.profiles.removeRemoteFavorite({ profileId: activeProfile.id, favoriteId });
    if (!res.ok) showV12FavoriteHint(res.error.message);
    await refreshV12EmbeddedRemoteCatalog();
  }

  async function handleV12ReorderRemoteFavorite(favoriteId: string, direction: "up" | "down"): Promise<void> {
    if (!activeProfile?.id) return;
    const res = await window.cofinder.profiles.reorderRemoteFavorite({ profileId: activeProfile.id, favoriteId, direction });
    if (!res.ok) showV12FavoriteHint(res.error.message);
    await refreshV12EmbeddedRemoteCatalog();
  }

  const localNavTools = (
    <div className="nav-efficiency-bar">
      <form
        className="path-form path-form--inline"
        onSubmit={(event) => {
          event.preventDefault();
          void navigateLocal(activeTab.id, localPane.pathInput);
        }}
      >
        <input
          value={localPane.pathInput}
          list="cofinder-local-path-suggestions"
          onChange={(event) =>
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === activeTab.id ? { ...tab, localPane: { ...tab.localPane, pathInput: event.target.value } } : tab
              )
            )
          }
          aria-label="Local path"
        />
        <datalist id="cofinder-local-path-suggestions">
          {localPathSuggestions.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
      </form>
      <input
        className="pane-filter-input"
        value={localPane.filterText}
        onChange={(event) => updateLocalFilter(activeTab.id, event.target.value)}
        placeholder="Filter names"
        aria-label="Filter local files by name"
      />
      <select
        className="history-select"
        value=""
        aria-label="Local recent locations"
        onChange={(event) => {
          const path = event.target.value;
          if (path) void navigateLocal(activeTab.id, path, "push");
        }}
      >
        <option value="">Recent</option>
        {localRecentPaths.map((item) => (
          <option key={`${item.path}-${item.visitedAt}`} value={item.path}>
            {item.label} - {item.path}
          </option>
        ))}
      </select>
      <select
        className="history-select"
        value=""
        aria-label="Local back and forward history"
        onChange={(event) => {
          const [mode, path] = event.target.value.split(":", 2) as ["back" | "forward", string];
          if (path) void navigateLocal(activeTab.id, path, mode);
        }}
      >
        <option value="">History</option>
        {localPane.history.backStack.slice().reverse().map((path) => (
          <option key={`back-${path}`} value={`back:${path}`}>
            Back: {path}
          </option>
        ))}
        {localPane.history.forwardStack.map((path) => (
          <option key={`forward-${path}`} value={`forward:${path}`}>
            Forward: {path}
          </option>
        ))}
      </select>
      <button type="button" className="toolbar-button" disabled={localRecentPaths.length === 0} onClick={clearLocalRecents}>
        Clear Recent
      </button>
    </div>
  );

  const remoteNavTools = (
    <div className="nav-efficiency-bar">
      <form
        className="path-form path-form--inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (remotePane.connectionId) void listRemotePath(remotePane.connectionId, remotePane.pathInput, "push", activeTab.id);
        }}
      >
        <input
          value={remotePane.pathInput}
          list="cofinder-remote-path-suggestions"
          disabled={!remotePane.connectionId}
          onChange={(event) =>
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === activeTab.id ? { ...tab, remotePane: { ...tab.remotePane, pathInput: event.target.value } } : tab
              )
            )
          }
          aria-label="Remote path"
        />
        <datalist id="cofinder-remote-path-suggestions">
          {remotePathSuggestions.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
      </form>
      <input
        className="pane-filter-input"
        value={remotePane.filterText}
        disabled={!remotePane.connectionId}
        onChange={(event) => updateRemoteFilter(activeTab.id, event.target.value)}
        placeholder="Filter names"
        aria-label="Filter remote files by name"
      />
      <select
        className="history-select"
        value=""
        disabled={!remotePane.connectionId || remoteRecentPaths.length === 0}
        aria-label="Remote recent locations"
        onChange={(event) => {
          const path = event.target.value;
          if (path && remotePane.connectionId) void listRemotePath(remotePane.connectionId, path, "push", activeTab.id);
        }}
      >
        <option value="">Recent</option>
        {remoteRecentPaths.map((item) => (
          <option key={`${item.path}-${item.visitedAt}`} value={item.path}>
            {item.label} - {item.path}
          </option>
        ))}
      </select>
      <select
        className="history-select"
        value=""
        disabled={!remotePane.connectionId}
        aria-label="Remote back and forward history"
        onChange={(event) => {
          const [mode, path] = event.target.value.split(":", 2) as ["back" | "forward", string];
          if (path && remotePane.connectionId) void listRemotePath(remotePane.connectionId, path, mode, activeTab.id);
        }}
      >
        <option value="">History</option>
        {remotePane.history.backStack.slice().reverse().map((path) => (
          <option key={`back-${path}`} value={`back:${path}`}>
            Back: {path}
          </option>
        ))}
        {remotePane.history.forwardStack.map((path) => (
          <option key={`forward-${path}`} value={`forward:${path}`}>
            Forward: {path}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="toolbar-button"
        disabled={!activeProfile?.id || remoteRecentPaths.length === 0}
        onClick={() => clearRemoteRecents(activeProfile?.id)}
      >
        Clear Recent
      </button>
    </div>
  );

  const localPaneEl = (
    <section
      className={localPaneSectionClass}
      style={uiShell === "v12" ? { flex: `0 0 ${Math.round(v12PaneRatio * 1000) / 10}%` } : undefined}
      onMouseDown={uiShell === "v12" ? () => setActivePane("local") : undefined}
    >
      {uiShell === "v12" ? (
        <>
          <div className="v12m-pane-chrome">
            <V12VisualLocationStrip
              title={localPaneTitleV12}
              meta="Local"
              segments={pathToSegments(localPane.currentPath || "/")}
              currentPath={localPane.currentPath || "/"}
              pathRootLabel="Macintosh HD"
              onNavigate={(path) => void navigateLocal(activeTab.id, path)}
            />
            {localNavTools}
          </div>
          <div className="v12m-pane-body">
            <div className="v12m-pane-split">
              <div className="v12m-pane-main v12m-pane-main--stack">
                {localPane.error ? <div className="cfv12p-error">{localPane.error}</div> : null}
                <V12VisualFileList
                  pane="local"
                  isPaneActive={activePane === "local"}
                  entries={sortedEntries}
                  sortKey={localPane.sortKey}
                  sortDirection={localPane.sortDirection}
                  selectedFullPaths={localPane.selectedFullPaths}
                  onSort={(key) => handleSort(activeTab.id, key)}
                  onRowClick={(entry, event) => {
                    if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                    if (
                      shouldStartInlineRenameFromClick("local", activeTab.id, entry.fullPath, localPane.selectedFullPaths, {
                        metaKey: event.metaKey,
                        shiftKey: event.shiftKey
                      })
                    ) {
                      openInlineRename(activeTab.id, "local");
                      lastPlainClickRef.current = null;
                      return;
                    }
                    handleLocalRowClick(activeTab.id, entry, {
                      metaKey: event.metaKey,
                      shiftKey: event.shiftKey,
                      clickDetail: event.detail
                    });
                    if (!event.metaKey && !event.shiftKey) {
                      lastPlainClickRef.current = { pane: "local", tabId: activeTab.id, path: entry.fullPath, at: Date.now() };
                    } else {
                      lastPlainClickRef.current = null;
                    }
                  }}
                  onRowContextMenu={(entry, event) => {
                    event.preventDefault();
                    openContextMenu(activeTab.id, "local", entry.fullPath, event);
                  }}
                  onRowDoubleClick={(entry) => {
                    if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                    void handleRowDoubleClick(activeTab.id, entry);
                  }}
                  onBackgroundMouseDown={(event) => {
                    beginMarqueeSelection("local", event);
                  }}
                  onBackgroundDragOver={(event) => handleTransferDragOver("local", localPane.currentPath, event)}
                  onBackgroundDrop={(event) => void handleTransferDrop("local", localPane.currentPath, event)}
                  onDragLeave={handleTransferDragLeave}
                  onRowDragStart={(entry, event) => beginTransferDrag("local", entry, event)}
                  onRowDragOver={(entry, event) => handleDirectoryRowDragOver("local", entry, event)}
                  onRowDrop={(entry, event) => void handleDirectoryRowDrop("local", entry, event)}
                  onRowDragEnd={() => setDropTarget(null)}
                  getRowClassName={(entry) => rowDropClass("local", entry.fullPath)}
                  inlineRename={
                    inlineRename && inlineRename.pane === "local" && inlineRename.tabId === activeTab.id
                      ? {
                          sourcePath: inlineRename.sourcePath,
                          draftName: inlineRename.draftName,
                          onChange: (value) => setInlineRename((prev) => (prev ? { ...prev, draftName: value } : prev)),
                          onBlur: () => void submitInlineRename(),
                          onKeyDown: (event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void submitInlineRename();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setInlineRename(null);
                            }
                          }
                        }
                      : null
                  }
                  formatSize={formatSize}
                  formatTime={formatTime}
                  sortMark={sortMark}
                  formatKind={formatKindV12}
                />
                <V12PaneFootStatus
                  selectedCount={selectedEntries.length}
                  totalCount={sortedEntries.length}
                  selectedSizeLabel={formatSize(selectedSize)}
                  totalSizeLabel={formatSize(totalSize)}
                />
              </div>
              {inspectorColumnVisible("local", localPane.selectedFullPaths.length, remoteConnected) && v12LocalInspectorReveal ? (
                <V12PaneInspector
                  scope="local"
                  selectionCount={localPane.selectedFullPaths.length}
                  selectedPaths={localPane.selectedFullPaths}
                  entries={sortedEntries}
                  info={localPane.selectedFullPaths.length === 1 ? v12LocalInsp.info : null}
                  infoLoading={localPane.selectedFullPaths.length === 1 && v12LocalInsp.status === "loading"}
                  infoError={localPane.selectedFullPaths.length === 1 ? v12LocalInsp.error : ""}
                  formatSize={formatSize}
                  formatTime={formatTime}
                  onQuickLook={() => void quickLookSelection(activeTab.id, "local")}
                  onRevealInFinder={async () => {
                    const target = localPane.selectedFullPaths[0];
                    if (!target) return;
                    const result = await window.cofinder.local.revealPath({ path: target });
                    if (!result.ok) setQueueError(result.error.message);
                  }}
                  onCopyPaths={() => void copySelection(activeTab.id, "local", "path")}
                  onGetInfo={() => void openInfoDialog(activeTab.id, "local")}
                />
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="pane-toolbar">
            <button
              type="button"
              className="nav-btn"
              aria-label="Back"
              title="Back"
              disabled={localPane.history.backStack.length === 0}
              onClick={() => {
                const target = localPane.history.backStack[localPane.history.backStack.length - 1];
                if (target) void navigateLocal(activeTab.id, target, "back");
              }}
            >
              ←
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Forward"
              title="Forward"
              disabled={localPane.history.forwardStack.length === 0}
              onClick={() => {
                const target = localPane.history.forwardStack[0];
                if (target) void navigateLocal(activeTab.id, target, "forward");
              }}
            >
              →
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Up"
              title="Up"
              onClick={() => void navigateLocal(activeTab.id, getParentPath(localPane.currentPath))}
            >
              ↑
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Home"
              title="Home"
              onClick={() => {
                if (localHomePath) {
                  void navigateLocal(activeTab.id, localHomePath);
                } else {
                  void initializeLocalHome(activeTab.id);
                }
              }}
            >
              ⌂
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Refresh"
              title="Refresh"
              disabled={!localPane.currentPath}
              onClick={() => void navigateLocal(activeTab.id, localPane.currentPath, "replace")}
            >
              ↻
            </button>
            <button
              type="button"
              className="toolbar-button"
              disabled={localPane.selectedFullPaths.length === 0 || !remotePane.connectionId}
              onClick={() => void enqueueUpload(activeTab.id)}
            >
              Upload
            </button>
          </div>

          {localNavTools}

          {localPane.error ? <div className="error-banner">{localPane.error}</div> : null}

          <div
            className={`table-wrap ${activePane === "local" ? "table-wrap-active" : ""}`}
            onMouseDown={(event) => {
              beginMarqueeSelection("local", event);
            }}
            onDragOver={(event) => handleTransferDragOver("local", localPane.currentPath, event)}
            onDrop={(event) => void handleTransferDrop("local", localPane.currentPath, event)}
            onDragLeave={handleTransferDragLeave}
          >
            <table className="file-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-size" />
                <col className="col-mtime" />
                <col className="col-type" />
              </colgroup>
              <thead>
                <tr>
                  <th className="name-header" onClick={() => handleSort(activeTab.id, "name")}>
                    name {localPane.sortKey === "name" ? sortMark(localPane.sortDirection) : ""}
                  </th>
                  <th className="size-header" onClick={() => handleSort(activeTab.id, "size")}>
                    size {localPane.sortKey === "size" ? sortMark(localPane.sortDirection) : ""}
                  </th>
                  <th className="mtime-header" onClick={() => handleSort(activeTab.id, "mtime")}>
                    mtime {localPane.sortKey === "mtime" ? sortMark(localPane.sortDirection) : ""}
                  </th>
                  <th className="type-header">type</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => (
                  <tr
                    key={entry.fullPath}
                    draggable={!(inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath)}
                    data-pane-row="true"
                    data-marquee-pane="local"
                    data-full-path={entry.fullPath}
                    className={`${localPane.selectedFullPaths.includes(entry.fullPath) ? "row-selected" : ""} ${rowDropClass("local", entry.fullPath)}`.trim()}
                    onDragStart={(event) => beginTransferDrag("local", entry, event)}
                    onDragOver={(event) => handleDirectoryRowDragOver("local", entry, event)}
                    onDrop={(event) => void handleDirectoryRowDrop("local", entry, event)}
                    onDragEnd={() => setDropTarget(null)}
                    onClick={(event) => {
                      if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                      if (
                        shouldStartInlineRenameFromClick("local", activeTab.id, entry.fullPath, localPane.selectedFullPaths, {
                          metaKey: event.metaKey,
                          shiftKey: event.shiftKey
                        })
                      ) {
                        openInlineRename(activeTab.id, "local");
                        lastPlainClickRef.current = null;
                        return;
                      }
                      handleLocalRowClick(activeTab.id, entry, {
                        metaKey: event.metaKey,
                        shiftKey: event.shiftKey,
                        clickDetail: event.detail
                      });
                      if (!event.metaKey && !event.shiftKey) {
                        lastPlainClickRef.current = { pane: "local", tabId: activeTab.id, path: entry.fullPath, at: Date.now() };
                      } else {
                        lastPlainClickRef.current = null;
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openContextMenu(activeTab.id, "local", entry.fullPath, event);
                    }}
                    onDoubleClick={() => {
                      if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                      void handleRowDoubleClick(activeTab.id, entry);
                    }}
                  >
                    <td className="name-cell" title={entry.name}>
                      <span className={`file-kind kind-${entry.type}`} aria-hidden="true">
                        {entry.type === "directory" ? "▸" : "·"}
                      </span>
                      {inlineRename &&
                      inlineRename.pane === "local" &&
                      inlineRename.tabId === activeTab.id &&
                      inlineRename.sourcePath === entry.fullPath ? (
                        <input
                          className="name-inline-input"
                          autoFocus
                          value={inlineRename.draftName}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setInlineRename((prev) => (prev ? { ...prev, draftName: event.target.value } : prev))
                          }
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onBlur={() => void submitInlineRename()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void submitInlineRename();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setInlineRename(null);
                            }
                          }}
                        />
                      ) : (
                        <span className="name-text">{entry.name}</span>
                      )}
                    </td>
                    <td className="size-cell">{entry.type === "directory" ? "—" : formatSize(entry.size)}</td>
                    <td className="mtime-cell">{formatTime(entry.mtime)}</td>
                    <td className="type-cell">{entry.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pane-status">
            <span>Selected: {selectedEntries.length}</span>
            <span>Total: {sortedEntries.length}</span>
            <span>Selected Size: {formatSize(selectedSize)}</span>
            <span>Total Size: {formatSize(totalSize)}</span>
          </div>
        </>
      )}
    </section>
  );

  const remotePaneEl = (
    <section
      className={remotePaneSectionClass}
      style={uiShell === "v12" ? { flex: "1 1 0" } : undefined}
      onMouseDown={uiShell === "v12" ? () => setActivePane("remote") : undefined}
    >
      {uiShell === "v12" ? (
        !(remotePane.connectionStatus === "connected" && remotePane.connectionId) ? (
          <>
            <div className="v12m-pane-chrome is-muted">
              <V12VisualLocationStrip
                title={remotePaneTitleV12}
                meta={remotePaneMetaV12}
                segments={pathToSegments(remotePane.currentPath || "/")}
                currentPath={remotePane.currentPath || "/"}
                pathRootLabel="/"
                badge={remoteBadgeV12}
                onNavigate={() => {}}
              />
              {remoteNavTools}
            </div>
            <div className="v12m-pane-body">
              <div className="v12m-pane-split">
                <div className="v12m-pane-main v12m-pane-main--stack">
                  <V12RemoteEmbeddedConnect
                    key={activeTab.id}
                    profiles={v12EmbeddedRemoteCatalog.profiles}
                    listError={v12EmbeddedRemoteCatalog.listError}
                    credentialAvailable={v12EmbeddedRemoteCatalog.credentialAvailable}
                    connectionStatus={remotePane.connectionStatus}
                    paneError={remotePane.error}
                    initialProfileId={v12RemoteEmbeddedInitialProfileByTab[activeTab.id] ?? null}
                    onInitialProfileConsumed={() =>
                      setV12RemoteEmbeddedInitialProfileByTab((prev) => {
                        const next = { ...prev };
                        delete next[activeTab.id];
                        return next;
                      })
                    }
                    onOpenSiteManager={() => openSiteManagerForTab(activeTab.id)}
                    onReloadProfiles={() => void refreshV12EmbeddedRemoteCatalog()}
                    onConnect={(payload) => void handleV12EmbeddedRemoteSubmit(activeTab.id, payload)}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="v12m-pane-chrome">
              <V12VisualLocationStrip
                title={remotePaneTitleV12}
                meta={remotePaneMetaV12}
                segments={pathToSegments(remotePane.currentPath || "/")}
                currentPath={remotePane.currentPath || "/"}
                pathRootLabel="/"
                badge={remoteBadgeV12}
                onNavigate={(path) => void listRemotePath(remotePane.connectionId!, path, "push", activeTab.id)}
                trailing={
                  <button type="button" className="v12m-insp-linkbtn" onClick={() => void disconnectRemote(activeTab.id)}>
                    Disconnect
                  </button>
                }
              />
              {remoteNavTools}
            </div>
            <div className="v12m-pane-body">
              <div className="v12m-pane-split">
                <div className="v12m-pane-main v12m-pane-main--stack">
                  {remotePane.error ? <div className="cfv12p-error">{remotePane.error}</div> : null}
                  <V12VisualFileList
                    pane="remote"
                    isPaneActive={activePane === "remote"}
                    entries={sortedRemoteEntries}
                    sortKey={remotePane.sortKey}
                    sortDirection={remotePane.sortDirection}
                    selectedFullPaths={remotePane.selectedFullPaths}
                    onSort={(key) => handleRemoteSort(activeTab.id, key)}
                    onRowClick={(entry, event) => {
                      if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                      if (
                        shouldStartInlineRenameFromClick("remote", activeTab.id, entry.fullPath, remotePane.selectedFullPaths, {
                          metaKey: event.metaKey,
                          shiftKey: event.shiftKey
                        })
                      ) {
                        openInlineRename(activeTab.id, "remote");
                        lastPlainClickRef.current = null;
                        return;
                      }
                      handleRemoteRowClick(activeTab.id, entry, {
                        metaKey: event.metaKey,
                        shiftKey: event.shiftKey,
                        clickDetail: event.detail
                      });
                      if (!event.metaKey && !event.shiftKey) {
                        lastPlainClickRef.current = { pane: "remote", tabId: activeTab.id, path: entry.fullPath, at: Date.now() };
                      } else {
                        lastPlainClickRef.current = null;
                      }
                    }}
                    onRowContextMenu={(entry, event) => {
                      event.preventDefault();
                      openContextMenu(activeTab.id, "remote", entry.fullPath, event);
                    }}
                    onRowDoubleClick={(entry) => {
                      if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                      void handleRemoteDoubleClick(activeTab.id, entry);
                    }}
                    onBackgroundMouseDown={(event) => {
                      beginMarqueeSelection("remote", event);
                    }}
                    onBackgroundDragOver={(event) => handleTransferDragOver("remote", remotePane.currentPath, event)}
                    onBackgroundDrop={(event) => void handleTransferDrop("remote", remotePane.currentPath, event)}
                    onDragLeave={handleTransferDragLeave}
                    onRowDragStart={(entry, event) => beginTransferDrag("remote", entry, event)}
                    onRowDragOver={(entry, event) => handleDirectoryRowDragOver("remote", entry, event)}
                    onRowDrop={(entry, event) => void handleDirectoryRowDrop("remote", entry, event)}
                    onRowDragEnd={() => setDropTarget(null)}
                    getRowClassName={(entry) => rowDropClass("remote", entry.fullPath)}
                    inlineRename={
                      inlineRename && inlineRename.pane === "remote" && inlineRename.tabId === activeTab.id
                        ? {
                            sourcePath: inlineRename.sourcePath,
                            draftName: inlineRename.draftName,
                            onChange: (value) => setInlineRename((prev) => (prev ? { ...prev, draftName: value } : prev)),
                            onBlur: () => void submitInlineRename(),
                            onKeyDown: (event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void submitInlineRename();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                setInlineRename(null);
                              }
                            }
                          }
                        : null
                    }
                    formatSize={formatSize}
                    formatTime={formatTime}
                    sortMark={sortMark}
                    formatKind={formatKindV12}
                  />
                  <V12PaneFootStatus
                    selectedCount={remoteSelectedEntries.length}
                    totalCount={sortedRemoteEntries.length}
                    selectedSizeLabel={formatSize(remoteSelectedSize)}
                    totalSizeLabel={formatSize(remoteTotalSize)}
                  />
                </div>
                {inspectorColumnVisible("remote", remotePane.selectedFullPaths.length, remoteConnected) && v12RemoteInspectorReveal ? (
                  <V12PaneInspector
                    scope="remote"
                    selectionCount={remotePane.selectedFullPaths.length}
                    selectedPaths={remotePane.selectedFullPaths}
                    entries={sortedRemoteEntries}
                    info={remotePane.selectedFullPaths.length === 1 ? v12RemoteInsp.info : null}
                    infoLoading={remotePane.selectedFullPaths.length === 1 && v12RemoteInsp.status === "loading"}
                    infoError={remotePane.selectedFullPaths.length === 1 ? v12RemoteInsp.error : ""}
                    formatSize={formatSize}
                    formatTime={formatTime}
                    hostLabel={`${remotePane.username}@${remotePane.host}:${remotePane.port}`}
                    onCopyPaths={() => void copySelection(activeTab.id, "remote", "path")}
                    onGetInfo={() => void openInfoDialog(activeTab.id, "remote")}
                  />
                ) : null}
              </div>
            </div>
          </>
        )
      ) : (
        <>
          {!(remotePane.connectionStatus === "connected" && remotePane.connectionId) ? (
            <div className="remote-disconnected-wrap">
              <div className="placeholder-pane">
                <div className="placeholder-title">Not connected</div>
                <div className="placeholder-body">Connect to a server to browse remote files.</div>
                <button
                  type="button"
                  className="toolbar-button placeholder-action"
                  disabled={remotePane.connectionStatus === "connecting"}
                  onClick={() => openSiteManagerForTab(activeTab.id)}
                >
                  Connect...
                </button>
              </div>
              {remotePane.connectionStatus === "connecting" ? (
                <p className="remote-connecting-hint">Connecting…</p>
              ) : null}
              {remotePane.connectionStatus === "failed" && remotePane.error ? (
                <div className="error-banner">{remotePane.error}</div>
              ) : null}
            </div>
          ) : null}

          {remotePane.connectionStatus === "connected" && remotePane.connectionId ? (
            <>
              <div className="pane-toolbar">
                <button
                  type="button"
                  className="nav-btn"
                  title="Back"
                  disabled={remotePane.history.backStack.length === 0}
                  onClick={() => {
                    const target = remotePane.history.backStack[remotePane.history.backStack.length - 1];
                    if (target) void listRemotePath(remotePane.connectionId!, target, "back", activeTab.id);
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Forward"
                  disabled={remotePane.history.forwardStack.length === 0}
                  onClick={() => {
                    const target = remotePane.history.forwardStack[0];
                    if (target) void listRemotePath(remotePane.connectionId!, target, "forward", activeTab.id);
                  }}
                >
                  →
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Up"
                  onClick={() => void listRemotePath(remotePane.connectionId!, getParentPath(remotePane.currentPath), "push", activeTab.id)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Home"
                  onClick={() => void listRemotePath(remotePane.connectionId!, remotePane.homePath, "push", activeTab.id)}
                >
                  ⌂
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  title="Refresh"
                  onClick={() => void listRemotePath(remotePane.connectionId!, remotePane.currentPath, "replace", activeTab.id)}
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  disabled={remotePane.selectedFullPaths.length === 0 || !localPane.currentPath}
                  onClick={() => void enqueueDownload(activeTab.id)}
                >
                  Download
                </button>
                <button type="button" className="toolbar-button" onClick={() => void disconnectRemote(activeTab.id)}>
                  Disconnect
                </button>
              </div>

              {remoteNavTools}

              {remotePane.error ? <div className="error-banner">{remotePane.error}</div> : null}

              <div
                className={`table-wrap ${activePane === "remote" ? "table-wrap-active" : ""}`}
                onMouseDown={(event) => {
                  beginMarqueeSelection("remote", event);
                }}
                onDragOver={(event) => handleTransferDragOver("remote", remotePane.currentPath, event)}
                onDrop={(event) => void handleTransferDrop("remote", remotePane.currentPath, event)}
                onDragLeave={handleTransferDragLeave}
              >
                <table className="file-table">
                  <colgroup>
                    <col className="col-name" />
                    <col className="col-size" />
                    <col className="col-mtime" />
                    <col className="col-type" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="name-header" onClick={() => handleRemoteSort(activeTab.id, "name")}>
                        name {remotePane.sortKey === "name" ? sortMark(remotePane.sortDirection) : ""}
                      </th>
                      <th className="size-header" onClick={() => handleRemoteSort(activeTab.id, "size")}>
                        size {remotePane.sortKey === "size" ? sortMark(remotePane.sortDirection) : ""}
                      </th>
                      <th className="mtime-header" onClick={() => handleRemoteSort(activeTab.id, "mtime")}>
                        mtime {remotePane.sortKey === "mtime" ? sortMark(remotePane.sortDirection) : ""}
                      </th>
                      <th className="type-header">type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRemoteEntries.map((entry) => (
                      <tr
                        key={entry.fullPath}
                        draggable={!(inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath)}
                        data-pane-row="true"
                        data-marquee-pane="remote"
                        data-full-path={entry.fullPath}
                        className={`${remotePane.selectedFullPaths.includes(entry.fullPath) ? "row-selected" : ""} ${rowDropClass("remote", entry.fullPath)}`.trim()}
                        onDragStart={(event) => beginTransferDrag("remote", entry, event)}
                        onDragOver={(event) => handleDirectoryRowDragOver("remote", entry, event)}
                        onDrop={(event) => void handleDirectoryRowDrop("remote", entry, event)}
                        onDragEnd={() => setDropTarget(null)}
                        onClick={(event) => {
                          if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                          if (
                            shouldStartInlineRenameFromClick("remote", activeTab.id, entry.fullPath, remotePane.selectedFullPaths, {
                              metaKey: event.metaKey,
                              shiftKey: event.shiftKey
                            })
                          ) {
                            openInlineRename(activeTab.id, "remote");
                            lastPlainClickRef.current = null;
                            return;
                          }
                          handleRemoteRowClick(activeTab.id, entry, {
                            metaKey: event.metaKey,
                            shiftKey: event.shiftKey,
                            clickDetail: event.detail
                          });
                          if (!event.metaKey && !event.shiftKey) {
                            lastPlainClickRef.current = { pane: "remote", tabId: activeTab.id, path: entry.fullPath, at: Date.now() };
                          } else {
                            lastPlainClickRef.current = null;
                          }
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openContextMenu(activeTab.id, "remote", entry.fullPath, event);
                        }}
                        onDoubleClick={() => {
                          if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                          void handleRemoteDoubleClick(activeTab.id, entry);
                        }}
                      >
                        <td className="name-cell" title={entry.name}>
                          <span className={`file-kind kind-${entry.type}`} aria-hidden="true">
                            {entry.type === "directory" ? "▸" : "·"}
                          </span>
                          {inlineRename &&
                          inlineRename.pane === "remote" &&
                          inlineRename.tabId === activeTab.id &&
                          inlineRename.sourcePath === entry.fullPath ? (
                            <input
                              className="name-inline-input"
                              autoFocus
                              value={inlineRename.draftName}
                              onFocus={(event) => event.currentTarget.select()}
                              onChange={(event) =>
                                setInlineRename((prev) => (prev ? { ...prev, draftName: event.target.value } : prev))
                              }
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onBlur={() => void submitInlineRename()}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void submitInlineRename();
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  setInlineRename(null);
                                }
                              }}
                            />
                          ) : (
                            <span className="name-text">{entry.name}</span>
                          )}
                        </td>
                        <td className="size-cell">{entry.type === "directory" ? "—" : formatSize(entry.size)}</td>
                        <td className="mtime-cell">{formatTime(entry.mtime)}</td>
                        <td className="type-cell">{entry.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pane-status">
                <span>Selected: {remoteSelectedEntries.length}</span>
                <span>Total: {sortedRemoteEntries.length}</span>
                <span>Selected Size: {formatSize(remoteSelectedSize)}</span>
                <span>Total Size: {formatSize(remoteTotalSize)}</span>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );

  const marqueeOverlay = marquee ? (
    <div
      className="marquee-rect"
      style={{
        left: `${normalizeDragRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY).left}px`,
        top: `${normalizeDragRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY).top}px`,
        width: `${normalizeDragRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY).right - normalizeDragRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY).left}px`,
        height: `${normalizeDragRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY).bottom - normalizeDragRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY).top}px`
      }}
    />
  ) : null;

  return (
    <div className={`${uiShell === "v12" ? "app-shell app-shell--v12" : "app-shell"} density-${appSettings.appearance.rowDensity}`}>
      {uiShell === "v11" ? (
        <>
          <header className="top-bar">
            <div className="title-group">
              <strong>CoFinder</strong>
            </div>
            <button type="button" className="toolbar-button" onClick={openPreferences}>
              Preferences
            </button>
            <div className="top-version" aria-label="App version">
              Version {appVersion}
            </div>
          </header>
          {tabBar}
        </>
      ) : null}
      {uiShell === "v11" ? (
        <main className="pane-layout">
          {localPaneEl}
          <section className="splitter" />
          {remotePaneEl}
        </main>
      ) : (
        <AppShellV12
          titleTabs={tabBar}
          banner={null}
          toolbar={v12Toolbar!}
          devHint={import.meta.env.DEV ? <V12ProdDevHint /> : null}
          drawer={queueV12Drawer}
          localPane={localPaneEl}
          splitter={
            <div
              className="v12m-pane-resizer"
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize panes. Double-click to reset."
              onMouseDown={beginV12PaneResize}
              onDoubleClick={() => persistV12PaneRatio(0.5)}
            />
          }
          remotePane={remotePaneEl}
          sidebar={
            appSettings.appearance.sidebarVisible ? (
              <V12LocalFavoritesSidebar
              favorites={v12LocalFavorites}
              currentLocalPath={localPane.currentPath || "/"}
              hint={v12FavoriteHint}
              remoteFavorites={activeProfile?.remoteFavorites ?? []}
              remoteConnected={remoteConnected}
              currentRemotePath={remotePane.currentPath || "/"}
              onSelectFavorite={(path) => {
                setActivePane("local");
                clearLocalSelection(activeTab.id);
                cancelV12LocalInspRevealTimer();
                setV12LocalInspectorReveal(false);
                void navigateLocal(activeTab.id, path, "push");
              }}
              onAddCurrentPath={() => void handleV12AddLocalFavorite()}
              onRemoveFavorite={(id) => void handleV12RemoveLocalFavorite(id)}
              onReorderFavorite={(id, direction) => void handleV12ReorderLocalFavorite(id, direction)}
              onRestoreDefaults={() => void handleV12RestoreDefaultFavorites()}
              onSelectRemoteFavorite={(path) => {
                setActivePane("remote");
                clearRemoteSelection(activeTab.id);
                if (remotePane.connectionId) void listRemotePath(remotePane.connectionId, path, "push", activeTab.id);
              }}
              onAddCurrentRemotePath={() => void handleV12AddRemoteFavorite()}
              onRemoveRemoteFavorite={(id) => void handleV12RemoveRemoteFavorite(id)}
              onReorderRemoteFavorite={(id, direction) => void handleV12ReorderRemoteFavorite(id, direction)}
            />
            ) : null
          }
        />
      )}
      {uiShell === "v11" ? queueV11Section : null}
      {marqueeOverlay}
      {preferences.open ? (
        <div className="preferences-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setPreferences((p) => ({ ...p, open: false }))}>
          <div className="preferences-dialog" role="dialog" aria-modal="true" aria-label="Preferences">
            <div className="preferences-head">
              <strong>Preferences</strong>
              <button type="button" className="toolbar-button" onClick={() => setPreferences((p) => ({ ...p, open: false }))}>
                Close
              </button>
            </div>
            {preferences.error ? <div className="error-banner">{preferences.error}</div> : null}
            <div className="preferences-grid">
              <label>
                Default local path
                <input
                  value={preferences.draft.general.defaultLocalPath}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      draft: { ...p.draft, general: { ...p.draft.general, defaultLocalPath: e.target.value } }
                    }))
                  }
                  placeholder="Use macOS Home"
                />
              </label>
              <label>
                Conflict policy
                <select
                  value={preferences.draft.transfer.defaultConflictPolicy}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      draft: {
                        ...p.draft,
                        transfer: { ...p.draft.transfer, defaultConflictPolicy: e.target.value as AppSettings["transfer"]["defaultConflictPolicy"] }
                      }
                    }))
                  }
                >
                  <option value="prompt">Ask every time</option>
                  <option value="rename">Rename / keep both</option>
                  <option value="skip">Skip conflicts</option>
                  <option value="overwrite">Overwrite</option>
                </select>
              </label>
              <label>
                Queue auto-hide delay
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={Math.round(preferences.draft.transfer.queueAutoHideDelayMs / 1000)}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      draft: {
                        ...p.draft,
                        transfer: { ...p.draft.transfer, queueAutoHideDelayMs: Math.max(0, Math.min(60, Number(e.target.value))) * 1000 }
                      }
                    }))
                  }
                />
              </label>
              <label>
                Row density
                <select
                  value={preferences.draft.appearance.rowDensity}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      draft: { ...p.draft, appearance: { ...p.draft.appearance, rowDensity: e.target.value as "compact" | "comfortable" } }
                    }))
                  }
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label>
                Default pane ratio
                <input
                  type="number"
                  min={25}
                  max={75}
                  value={Math.round(preferences.draft.appearance.defaultPaneRatio * 100)}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      draft: {
                        ...p.draft,
                        appearance: { ...p.draft.appearance, defaultPaneRatio: Math.max(25, Math.min(75, Number(e.target.value))) / 100 }
                      }
                    }))
                  }
                />
              </label>
              {[
                ["Restore last session", "restoreLastSession"],
                ["Confirm before delete", "confirmBeforeDelete"],
                ["Show hidden files", "showHiddenFiles"]
              ].map(([label, key]) => (
                <label key={key} className="preferences-check">
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.draft.general[key as keyof AppSettings["general"]])}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        draft: { ...p.draft, general: { ...p.draft.general, [key]: e.target.checked } }
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
              {[
                ["Preserve timestamps", "preserveTimestamps"],
              ].map(([label, key]) => (
                <label key={key} className="preferences-check">
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.draft.transfer[key as keyof AppSettings["transfer"]])}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        draft: { ...p.draft, transfer: { ...p.draft.transfer, [key]: e.target.checked } }
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
              {[
                ["Show inspector by default", "defaultInspectorVisible"],
                ["Show sidebar", "sidebarVisible"]
              ].map(([label, key]) => (
                <label key={key} className="preferences-check">
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.draft.appearance[key as keyof AppSettings["appearance"]])}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        draft: { ...p.draft, appearance: { ...p.draft.appearance, [key]: e.target.checked } }
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="preferences-shortcuts">
              <strong>Shortcuts</strong>
              <p>F2 rename · Delete remove · Cmd+I info · Cmd+Shift+C copy path · Cmd+R refresh · Cmd+U upload · Cmd+D download · Cmd+K Site Manager</p>
            </div>
            <div className="preferences-actions">
              <button type="button" className="toolbar-button" onClick={() => setPreferences((p) => ({ ...p, draft: appSettings, error: "" }))}>
                Reset
              </button>
              <button type="button" className="toolbar-button is-active" onClick={() => void savePreferences()}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          className="context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.pane === "local" ? (
            <>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) !== 1}
                onClick={() => {
                  openInlineRename(contextMenu.tabId, "local");
                  setContextMenu(null);
                }}
              >
                Rename
                <span className="context-shortcut">F2</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) === 0}
                onClick={() => {
                  openDeleteConfirm(contextMenu.tabId, "local");
                  setContextMenu(null);
                }}
              >
                Delete
                <span className="context-shortcut">Del</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await openInfoDialog(contextMenu.tabId, "local");
                  setContextMenu(null);
                }}
              >
                Get Info
                <span className="context-shortcut">⌘I</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await quickLookSelection(contextMenu.tabId, "local");
                  setContextMenu(null);
                }}
              >
                Quick Look
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  const tab = tabs.find((t) => t.id === contextMenu.tabId);
                  const target = tab?.localPane.selectedFullPaths[0];
                  if (target) {
                    const result = await window.cofinder.local.openPath({ path: target });
                    if (!result.ok) setQueueError(result.error.message);
                  }
                  setContextMenu(null);
                }}
              >
                Open
              </button>
              <button
                type="button"
                className="context-item"
                disabled={
                  (tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) === 0 ||
                  !(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.connectionId ?? null)
                }
                onClick={async () => {
                  await enqueueUpload(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                Upload
                <span className="context-shortcut">⌘U</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  const tab = tabs.find((t) => t.id === contextMenu.tabId);
                  const target = tab?.localPane.selectedFullPaths[0];
                  if (target) {
                    const result = await window.cofinder.local.revealPath({ path: target });
                    if (!result.ok) setQueueError(result.error.message);
                  }
                  setContextMenu(null);
                }}
              >
                Reveal in Finder
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  await copySelection(contextMenu.tabId, "local", "name");
                  setContextMenu(null);
                }}
              >
                Copy Name
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  await copySelection(contextMenu.tabId, "local", "path");
                  setContextMenu(null);
                }}
              >
                Copy Full Path
                <span className="context-shortcut">⌘⇧C</span>
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  const tab = tabs.find((t) => t.id === contextMenu.tabId);
                  if (tab) await navigateLocal(contextMenu.tabId, tab.localPane.currentPath, "replace");
                  setContextMenu(null);
                }}
              >
                Refresh
                <span className="context-shortcut">⌘R</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await previewRemoteSelection(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                Open
                <span className="context-shortcut">double-click</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={
                  (tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) === 0 ||
                  !(tabs.find((t) => t.id === contextMenu.tabId)?.localPane.currentPath ?? "")
                }
                onClick={async () => {
                  await enqueueDownload(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                Download
                <span className="context-shortcut">⌘D</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) === 0}
                onClick={() => {
                  openDeleteConfirm(contextMenu.tabId, "remote");
                  setContextMenu(null);
                }}
              >
                Delete
                <span className="context-shortcut">Del</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await openInfoDialog(contextMenu.tabId, "remote");
                  setContextMenu(null);
                }}
              >
                Get Info
                <span className="context-shortcut">⌘I</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={() => {
                  openInlineRename(contextMenu.tabId, "remote");
                  setContextMenu(null);
                }}
              >
                Rename
                <span className="context-shortcut">F2</span>
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  await copySelection(contextMenu.tabId, "remote", "name");
                  setContextMenu(null);
                }}
              >
                Copy Name
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  await copySelection(contextMenu.tabId, "remote", "path");
                  setContextMenu(null);
                }}
              >
                Copy Full Path
                <span className="context-shortcut">⌘⇧C</span>
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  const tab = tabs.find((t) => t.id === contextMenu.tabId);
                  if (tab?.remotePane.connectionId) {
                    await listRemotePath(tab.remotePane.connectionId, tab.remotePane.currentPath, "replace", contextMenu.tabId);
                  }
                  setContextMenu(null);
                }}
              >
                Refresh
                <span className="context-shortcut">⌘R</span>
              </button>
            </>
          )}
        </div>
      ) : null}
      {deleteConfirm ? (
        <div className="delete-confirm-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="delete-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <h3 id="delete-confirm-title">Confirm Delete</h3>
            <p>
              Delete {deleteConfirm.paths.length} {deleteConfirm.paths.length === 1 ? "item" : "items"} from{" "}
              {deleteConfirm.pane === "local" ? "local" : "remote"}?
            </p>
            <div className="delete-confirm-list">
              {deleteConfirm.names.slice(0, 8).map((name, index) => (
                <div key={`${name}-${index}`}>{name}</div>
              ))}
              {deleteConfirm.names.length > 8 ? <div>...and {deleteConfirm.names.length - 8} more</div> : null}
            </div>
            <div className="delete-confirm-actions">
              <button type="button" className="toolbar-button" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button type="button" className="toolbar-button danger" onClick={() => void submitDeleteConfirm()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {infoDialog ? (
        <div className="info-dialog-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setInfoDialog(null)}>
          <div className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title">
            <h3 id="info-dialog-title">Get Info ({infoDialog.pane})</h3>
            <dl className="info-grid">
              <dt>Name</dt>
              <dd>{infoDialog.info.name}</dd>
              <dt>Path</dt>
              <dd className="info-path">{infoDialog.info.fullPath}</dd>
              <dt>Type</dt>
              <dd>{infoDialog.info.type}</dd>
              <dt>Size</dt>
              <dd>
                {infoDialog.isSizeLoading ? (
                  <span className="info-size-loading">
                    <span className="info-spinner" aria-hidden="true" />
                    Calculating...
                  </span>
                ) : (
                  formatSize(infoDialog.info.size)
                )}
              </dd>
              <dt>Modified</dt>
              <dd>{formatTime(infoDialog.info.mtime)}</dd>
              <dt>Permissions</dt>
              <dd>{infoDialog.info.permissions ?? "-"}</dd>
              <dt>Owner</dt>
              <dd>{infoDialog.info.owner ?? "-"}</dd>
              <dt>Group</dt>
              <dd>{infoDialog.info.group ?? "-"}</dd>
            </dl>
            <div className="info-actions">
              <button type="button" className="toolbar-button" onClick={() => setInfoDialog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {activeSiteManager?.open ? (
        <SiteManagerModal
          open={activeSiteManager.open}
          profiles={activeSiteManager.profiles}
          draft={activeSiteManager.draft}
          passwordDirty={activeSiteManager.passwordDirty}
          listError={activeSiteManager.listError}
          modalError={activeSiteManager.modalError}
          busy={activeSiteManager.busy}
          credentialAvailable={activeSiteManager.credentialAvailable}
          selectedProfileId={activeSiteManager.selectedProfileId}
          onClose={() => closeSiteManagerForTab(activeTab.id)}
          onSelectProfile={(profile) => handleSiteManagerSelectProfile(activeTab.id, profile)}
          onNew={() => handleSiteManagerNew(activeTab.id)}
          onDuplicate={() => handleSiteManagerDuplicate(activeTab.id)}
          onDelete={() => void handleSiteManagerDelete(activeTab.id)}
          onSave={() => void handleSiteManagerSave(activeTab.id)}
          onLogin={() => void handleSiteManagerLogin(activeTab.id)}
          onDraftPatch={(patch) => patchSiteManagerDraft(activeTab.id, patch)}
          onPasswordChange={(value) => setSiteManagerPasswordInput(activeTab.id, value)}
        />
      ) : null}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function sortMark(direction: SortDirection): string {
  return direction === "asc" ? "^" : "v";
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getEntryNameFromPath(fullPath: string): string {
  const normalized = fullPath.replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? fullPath;
}

function localPaneTitleFromPath(absolutePath: string): string {
  const n = (absolutePath || "").replace(/\/+/g, "/").trim() || "/";
  if (n === "/") return "Macintosh HD";
  const base = getEntryNameFromPath(n);
  return base && base !== "/" ? base : "Macintosh HD";
}

function formatKindV12(entry: LocalFileEntry | RemoteFileEntry): string {
  return entry.type === "directory" ? "Folder" : "Document";
}

function createLocalPaneState(): LocalPaneState {
  return {
    currentPath: "",
    pathInput: "",
    filterText: "",
    entries: [],
    selectedFullPaths: [],
    selectionAnchorFullPath: null,
    error: "",
    sortKey: "name",
    sortDirection: "asc",
    history: { backStack: [], forwardStack: [] }
  };
}

function createRemotePaneState(): RemotePaneState {
  return {
    connectionStatus: "disconnected",
    connectionId: null,
    activeProfileId: null,
    host: "",
    port: 22,
    username: "",
    authType: "password",
    homePath: "/",
    currentPath: "/",
    pathInput: "/",
    filterText: "",
    entries: [],
    selectedFullPaths: [],
    selectionAnchorFullPath: null,
    sortKey: "name",
    sortDirection: "asc",
    history: { backStack: [], forwardStack: [] },
    error: ""
  };
}

function createTabState(id: string, index: number): UiTabState {
  return {
    id,
    title: `Tab ${index}`,
    createdAt: Date.now(),
    localPane: createLocalPaneState(),
    remotePane: createRemotePaneState()
  };
}

function computeHistory(
  history: HistoryState,
  mode: "push" | "replace" | "back" | "forward",
  previousPath: string,
  nextPath: string
): HistoryState {
  if (mode === "replace") return history;
  if (mode === "back") {
    return {
      backStack: history.backStack.slice(0, -1),
      forwardStack: previousPath ? [previousPath, ...history.forwardStack] : history.forwardStack
    };
  }
  if (mode === "forward") {
    return {
      backStack: previousPath ? [...history.backStack, previousPath] : history.backStack,
      forwardStack: history.forwardStack.slice(1)
    };
  }
  if (!previousPath || previousPath === nextPath) return history;
  return {
    backStack: [...history.backStack, previousPath],
    forwardStack: []
  };
}

function getTabNumber(id: string, tabs: UiTabState[]): number {
  const index = tabs.findIndex((tab) => tab.id === id);
  return index >= 0 ? index + 1 : 1;
}

function promptForConflictPolicy(conflicts: TransferConflict[]): Exclude<TransferConflictPolicy, "prompt"> {
  const preview = conflicts
    .slice(0, 5)
    .map((conflict) => `- ${conflict.target} (${conflict.targetType})`)
    .join("\n");
  const more = conflicts.length > 5 ? `\n...and ${conflicts.length - 5} more` : "";
  const answer = window.prompt(
    `Destination already exists for ${conflicts.length} item(s):\n${preview}${more}\n\nType one option: overwrite, skip, rename, cancel`,
    "rename"
  );
  const normalized = answer?.trim().toLowerCase();
  if (normalized === "overwrite" || normalized === "skip" || normalized === "rename") return normalized;
  return "cancel";
}

function readLastLocalPath(): string {
  return window.localStorage.getItem(COFINDER_LAST_LOCAL_PATH_KEY)?.trim() ?? "";
}

function readRecentPathList(key: string): RecentPath[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentPath => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
        const row = item as Record<string, unknown>;
        return typeof row.path === "string" && typeof row.label === "string" && typeof row.visitedAt === "number";
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

function readRemoteRecentPathsByProfile(): Record<string, RecentPath[]> {
  try {
    const raw = window.localStorage.getItem(COFINDER_REMOTE_RECENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, RecentPath[]> = {};
    for (const [profileId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!profileId.trim()) continue;
      if (Array.isArray(value)) {
        out[profileId] = value
          .filter((item): item is RecentPath => {
            if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
            const row = item as Record<string, unknown>;
            return typeof row.path === "string" && typeof row.label === "string" && typeof row.visitedAt === "number";
          })
          .slice(0, 12);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeJsonLocalStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Recent-path persistence is a convenience only; navigation must keep working if storage is unavailable.
  }
}
