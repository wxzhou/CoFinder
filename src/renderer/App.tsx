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
import { V12PaneToolbar, V12ToolbarIconSelect } from "./v12/V12PaneToolbar";
import { V12TransferDrawer } from "./v12/V12TransferDrawer";
import { V12PaneInspector } from "./v12/V12PaneInspector";
import { pathToSegments } from "./v12/pane/pathSegments";
import { inspectorColumnVisible } from "./v12/v12InspectorVisibility";
import {
  V12PaneFootStatus,
  V12ProdDevHint,
  V12TbIcon,
  V12VisualFileList,
  V12VisualLocationStrip,
  type V12FileColumn,
  type V12FileColumnKey
} from "./v12/shared";
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
  applyKeyboardRowSelection,
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
import type { RemoteEditSession } from "../shared/remoteEdit";
import type {
  EnqueueDownloadRequest,
  EnqueueUploadRequest,
  AppSettings,
  PathInfo,
  ProfileUpsertPayload,
  RemoteConnectRequest,
  RemoteEditUpdatePayload,
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
type V12FileColumnSettings = Record<V12FileColumnKey, { width: number; visible: boolean }>;
type V12PaneFileColumnSettings = Record<"local" | "remote", V12FileColumnSettings>;
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
  isListing: boolean;
};

type ContextMenuState = {
  pane: "local" | "remote";
  tabId: string;
  x: number;
  y: number;
  scope: "row" | "background";
  terminalPath: string;
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

type DeleteBusyByTab = Record<string, Partial<Record<ActivePane, string>>>;

type CreateFolderDialogState = {
  pane: ActivePane;
  kind: "folder" | "textFile";
  tabId: string;
  name: string;
  error: string;
  busy: boolean;
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
const COFINDER_V12_COLUMNS_KEY = "cofinder.v12FileColumns.v2";
const INLINE_RENAME_CLICK_MIN_MS = 350;
const INLINE_RENAME_CLICK_MAX_MS = 1500;
const V12_DEFAULT_COLUMNS: V12FileColumn[] = [
  { key: "name", label: "Name", width: 320, visible: true, required: true },
  { key: "mtime", label: "Date modified", width: 136, visible: true },
  { key: "size", label: "Size", width: 78, visible: true },
  { key: "kind", label: "Kind", width: 92, visible: true },
  { key: "permissions", label: "Permission", width: 96, visible: false },
  { key: "owner", label: "Owner", width: 84, visible: false }
];
const DEFAULT_RENDERER_SETTINGS: AppSettings = {
  schemaVersion: 2,
  general: {
    defaultLocalPath: "",
    restoreLastSession: false,
    confirmBeforeDelete: true,
    showHiddenFiles: false,
    firstRunOnboardingDismissed: false,
    defaultTextEditor: "system"
  },
  transfer: {
    defaultConflictPolicy: "prompt",
    queueAutoHideDelayMs: AUTO_HIDE_DELAY_MS,
    preserveTimestamps: true
  },
  remote: {
    autoRefreshEnabled: false,
    autoRefreshIntervalSeconds: 60
  },
  appearance: {
    rowDensity: "comfortable",
    defaultInspectorVisible: false,
    defaultPaneRatio: 0.5,
    sidebarVisible: true,
    sidebarWidth: 260
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
  const [remoteEditTransferTasks, setRemoteEditTransferTasks] = useState<TransferTask[]>([]);
  const [remoteEditSessions, setRemoteEditSessions] = useState<RemoteEditSession[]>([]);
  const [queueError, setQueueError] = useState<string>("");
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_RENDERER_SETTINGS);
  const [preferences, setPreferences] = useState<PreferencesState>({
    open: false,
    draft: DEFAULT_RENDERER_SETTINGS,
    error: ""
  });
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("");
  const [localRecentPaths, setLocalRecentPaths] = useState<RecentPath[]>(() => readRecentPathList(COFINDER_LOCAL_RECENTS_KEY));
  const [remoteRecentPathsByProfile, setRemoteRecentPathsByProfile] = useState<Record<string, RecentPath[]>>(() =>
    readRemoteRecentPathsByProfile()
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineRename, setInlineRename] = useState<InlineRenameState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [createFolderDialog, setCreateFolderDialog] = useState<CreateFolderDialogState | null>(null);
  const [deleteBusyByTab, setDeleteBusyByTab] = useState<DeleteBusyByTab>({});
  const deleteInFlightKeysRef = useRef(new Set<string>());
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
  const [v12FileColumnSettings, setV12FileColumnSettings] = useState<V12PaneFileColumnSettings>(() => readV12FileColumnSettings());
  const v12LocalInspTokenRef = useRef(0);
  const v12RemoteInspTokenRef = useRef(0);
  const v12LocalInspRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const v12RemoteInspRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveTabIdForV12InspRef = useRef(activeTabId);
  const [v12LocalInspectorReveal, setV12LocalInspectorReveal] = useState(false);
  const [v12RemoteInspectorReveal, setV12RemoteInspectorReveal] = useState(false);
  const [pathEditPane, setPathEditPane] = useState<ActivePane | null>(null);
  type V12InspPaneState = {
    status: "idle" | "loading" | "ready" | "error";
    info: PathInfo | null;
    error: string;
    detailsLoading?: boolean;
    detailsError?: string;
  };
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
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const localPane = activeTab.localPane;
  const remotePane = activeTab.remotePane;
  const localDeleteBusy = deleteBusyByTab[activeTab.id]?.local ?? "";
  const remoteDeleteBusy = deleteBusyByTab[activeTab.id]?.remote ?? "";
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
      setOnboardingOpen(!settings.general.firstRunOnboardingDismissed);
      setV12PaneRatio(settings.appearance.defaultPaneRatio);
      setV12LocalInspectorReveal(false);
      setV12RemoteInspectorReveal(false);
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
    if (!appSettings.remote.autoRefreshEnabled) return undefined;
    const intervalSeconds = Math.max(5, Math.round(appSettings.remote.autoRefreshIntervalSeconds || 60));
    if (remotePane.connectionStatus !== "connected" || !remotePane.connectionId || !remotePane.currentPath) return undefined;
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void listRemotePath(remotePane.connectionId!, remotePane.currentPath, "replace", activeTab.id).finally(() => {
        inFlight = false;
      });
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [
    activeTab.id,
    appSettings.remote.autoRefreshEnabled,
    appSettings.remote.autoRefreshIntervalSeconds,
    remotePane.connectionId,
    remotePane.connectionStatus,
    remotePane.currentPath
  ]);

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
    const off = window.cofinder.remote.onEditUpdate((payload: RemoteEditUpdatePayload) => {
      const { session } = payload;
      setRemoteEditSessions((prev) => {
        const without = prev.filter((item) => item.id !== session.id);
        return [session, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
      });
      if (session.state === "uploaded") {
        setRemoteEditTransferTasks((prev) => [remoteEditSessionToTransferTask(session), ...prev.filter((item) => item.id !== remoteEditTransferTaskId(session.id))]);
        const tab = tabs.find((item) => item.id === session.tabId);
        if (tab?.remotePane.connectionId === session.connectionId && getParentPath(session.remotePath) === tab.remotePane.currentPath) {
          void listRemotePath(session.connectionId, tab.remotePane.currentPath, "replace", session.tabId);
        }
      } else if (session.state === "conflict" || session.state === "failed") {
        setQueueError(session.error || `Remote edit ${session.state}: ${session.remotePath}`);
      }
    });
    void loadRemoteEditSessions();
    return off;
  }, [tabs]);

  useEffect(() => window.cofinder.system.onOpenPreferences(openPreferences), [appSettings]);

  useEffect(() => {
    writeJsonLocalStorage(COFINDER_V12_COLUMNS_KEY, v12FileColumnSettings);
  }, [v12FileColumnSettings]);

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
          void quickLookSelection(activeTab.id, "remote");
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
          const selectedState = selectAllRows(sortedEntries, "first");
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeTab.id ? { ...tab, localPane: { ...tab.localPane, ...selectedState } } : tab
            )
          );
          if (uiShell === "v12") {
            cancelV12LocalInspRevealTimer();
          }
          event.preventDefault();
          event.stopPropagation();
        }
        if (activePane === "remote") {
          const selectedState = selectAllRows(sortedRemoteEntries, "first");
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeTab.id ? { ...tab, remotePane: { ...tab.remotePane, ...selectedState } } : tab
            )
          );
          if (uiShell === "v12") {
            cancelV12RemoteInspRevealTimer();
          }
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const cmd = event.metaKey || event.ctrlKey;
      if (contextMenu) return;
      if (cmd && event.key.toLowerCase() === "l") {
        beginPathEdit(activePane);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!cmd && !event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        if (isEditableTarget(document.activeElement)) return;
        moveSelectionByKeyboard(activeTab.id, activePane, event.key === "ArrowDown" ? 1 : -1, event.shiftKey);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!cmd && event.key !== "F2" && event.key !== "Delete" && event.key !== "Backspace") return;
      if (isEditableTarget(document.activeElement)) return;

      const key = event.key.toLowerCase();
      const prevent = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      const isKeyC = key === "c" || event.code === "KeyC";
      if (event.key === "F2") {
        openInlineRename(activeTab.id, activePane);
        prevent();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        openDeleteConfirm(activeTab.id, activePane);
        prevent();
      } else if (cmd && key === "i") {
        toggleInspectorFromShortcut(activeTab.id, activePane);
        prevent();
      } else if (cmd && event.altKey && isKeyC) {
        void copyCurrentPath(activePane);
        prevent();
      } else if (cmd && event.shiftKey && isKeyC) {
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

  async function loadRemoteEditSessions(): Promise<void> {
    const res = await window.cofinder.remote.editList();
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions(res.data.sessions);
  }

  async function revealRemoteEditCopy(sessionId: string): Promise<void> {
    const res = await window.cofinder.remote.editRevealLocal({ sessionId });
    if (!res.ok) setQueueError(res.error.message);
  }

  async function redownloadRemoteEdit(sessionId: string): Promise<void> {
    const res = await window.cofinder.remote.editRedownload({ sessionId });
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions((prev) => [res.data.session, ...prev.filter((item) => item.id !== sessionId)]);
  }

  async function saveRemoteEditNow(sessionId: string): Promise<void> {
    const res = await window.cofinder.remote.editSyncNow({ sessionId });
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions((prev) => [res.data.session, ...prev.filter((item) => item.id !== sessionId)]);
  }

  async function forceUploadRemoteEdit(sessionId: string): Promise<void> {
    const session = remoteEditSessions.find((item) => item.id === sessionId);
    if (session && !window.confirm(`Upload local edits to ${session.remotePath} and overwrite the current remote file?`)) return;
    const res = await window.cofinder.remote.editForceUpload({ sessionId });
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions((prev) => [res.data.session, ...prev.filter((item) => item.id !== sessionId)]);
  }

  async function downloadRemoteConflictCopy(sessionId: string): Promise<void> {
    const res = await window.cofinder.remote.editDownloadConflictCopy({ sessionId });
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions((prev) => [res.data.session, ...prev.filter((item) => item.id !== sessionId)]);
    setQueueError(`Downloaded remote conflict copy to ${res.data.remoteCopyPath}`);
  }

  async function copyRemoteEditConflictPaths(sessionId: string): Promise<void> {
    const res = await window.cofinder.remote.editCopyConflictPaths({ sessionId });
    if (!res.ok) setQueueError(res.error.message);
    else setQueueError("Copied remote edit conflict paths.");
  }

  async function stopRemoteEditMonitoring(sessionId: string): Promise<void> {
    const session = remoteEditSessions.find((item) => item.id === sessionId);
    const risky = session?.state === "dirty" || session?.state === "failed" || session?.state === "conflict";
    if (risky && !window.confirm(`Stop monitoring ${session.remotePath}? The local edit copy will be kept but no longer uploaded.`)) return;
    const res = await window.cofinder.remote.editClose({ sessionId, discardLocal: false });
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions((prev) => prev.filter((item) => item.id !== sessionId));
  }

  async function discardRemoteEditCopy(sessionId: string): Promise<void> {
    const session = remoteEditSessions.find((item) => item.id === sessionId);
    if (session && !window.confirm(`Discard the local edit copy for ${session.remotePath}?`)) return;
    const res = await window.cofinder.remote.editClose({ sessionId, discardLocal: true });
    if (!res.ok) {
      setQueueError(res.error.message);
      return;
    }
    setRemoteEditSessions((prev) => prev.filter((item) => item.id !== sessionId));
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

  function beginSidebarResize(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = appSettings.appearance.sidebarWidth;
    let nextWidth = startWidth;
    const clamp = (value: number) => Math.max(180, Math.min(420, value));
    const onMove = (move: MouseEvent) => {
      nextWidth = clamp(startWidth + move.clientX - startX);
      setAppSettings((prev) => ({ ...prev, appearance: { ...prev.appearance, sidebarWidth: nextWidth } }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      void window.cofinder.settings.set({ appearance: { sidebarWidth: nextWidth } }).then((res) => {
        if (res.ok) {
          setAppSettings(res.data);
          setPreferences((prev) => ({ ...prev, draft: res.data }));
        } else {
          setQueueError(res.error.message);
        }
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function dismissOnboarding(): Promise<void> {
    const next = {
      ...appSettings,
      general: { ...appSettings.general, firstRunOnboardingDismissed: true }
    };
    const res = await window.cofinder.settings.set(next);
    if (res.ok) {
      setAppSettings(res.data);
      setPreferences((prev) => ({ ...prev, draft: res.data }));
    } else {
      setQueueError(res.error.message);
    }
    setOnboardingOpen(false);
  }

  async function copyDiagnostics(): Promise<void> {
    setDiagnosticsStatus("Copying diagnostics...");
    const res = await window.cofinder.system.copyDiagnostics();
    setDiagnosticsStatus(res.ok ? "Diagnostics copied to clipboard." : res.error.message);
  }

  async function openLogFolder(): Promise<void> {
    const res = await window.cofinder.system.openLogFolder();
    setDiagnosticsStatus(res.ok ? `Opened ${res.data.path}` : res.error.message);
  }

  async function openLogFile(): Promise<void> {
    const res = await window.cofinder.system.openLogFile();
    setDiagnosticsStatus(res.ok ? `Opened ${res.data.path}` : res.error.message);
  }

  async function checkForUpdates(): Promise<void> {
    const res = await window.cofinder.system.checkForUpdates();
    setDiagnosticsStatus(res.ok ? res.data.message : res.error.message);
  }

  async function navigateLocal(
    tabId: string,
    targetPath: string,
    mode: "push" | "replace" | "back" | "forward" = "push"
  ): Promise<boolean> {
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
      return false;
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
    return true;
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

  const drawerTransferTasks = useMemo(() => [...remoteEditTransferTasks, ...transferTasks], [remoteEditTransferTasks, transferTasks]);

  const queueStats = useMemo(() => {
    const activeCount = drawerTransferTasks.filter((task) => task.status === "running").length;
    const queuedCount = drawerTransferTasks.filter((task) => task.status === "pending").length;
    const failedCount = drawerTransferTasks.filter((task) => task.status === "failed").length;
    const completedCount = drawerTransferTasks.filter((task) =>
      task.status === "success" || task.status === "canceled" || task.status === "stopped"
    ).length;
    const allDone = drawerTransferTasks.length > 0 && activeCount === 0 && queuedCount === 0;
    return { activeCount, queuedCount, failedCount, completedCount, allDone };
  }, [drawerTransferTasks]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (drawerTransferTasks.length === 0) {
      setQueuePanelState("hidden");
      return;
    }

    if (queueStats.allDone && queueStats.failedCount === 0 && !queuePinned) {
      setQueuePanelState("autoHidePending");
      timer = setTimeout(() => {
        setQueuePanelState("hidden");
        setRemoteEditTransferTasks([]);
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
  }, [drawerTransferTasks.length, queuePinned, queueStats.allDone, queueStats.failedCount, appSettings.transfer.queueAutoHideDelayMs]);

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
    setV12LocalInspectorReveal(false);
    setV12RemoteInspectorReveal(false);
  }, [activeTabId, uiShell]);

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
      const selectedEntry = localPane.entries.find((entry) => entry.fullPath === path);
      const isDirectory = selectedEntry?.type === "directory";
      const r = await window.cofinder.local.getInfo({ path, includeDirectorySize: false });
      if (token !== v12LocalInspTokenRef.current) return;
      if (!r.ok) {
        setV12LocalInsp({ status: "error", info: null, error: r.error.message });
        return;
      }
      const base = r.data.info;
      setV12LocalInsp({ status: "ready", info: base, error: "", detailsLoading: isDirectory });
      if (!isDirectory) return;
      const detailed = await window.cofinder.local.getInfo({ path, includeDirectorySize: true });
      if (token !== v12LocalInspTokenRef.current) return;
      if (!detailed.ok) {
        setV12LocalInsp((prev) => ({ ...prev, detailsLoading: false, detailsError: detailed.error.message }));
        return;
      }
      setV12LocalInsp({ status: "ready", info: detailed.data.info, error: "", detailsLoading: false });
    })();
  }, [uiShell, remoteConnected, activeTab.id, localPane.selectedFullPaths, localPane.entries, v12LocalInspectorReveal]);

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
    let unsubscribeSize: (() => void) | null = null;
    let sizeJobId: string | null = null;
    void (async () => {
      const selectedEntry = remotePane.entries.find((entry) => entry.fullPath === path);
      const isDirectory = selectedEntry?.type === "directory";
      const r = await window.cofinder.remote.getInfo({ connectionId: conn, path, includeDirectorySize: false });
      if (token !== v12RemoteInspTokenRef.current) return;
      if (!r.ok) {
        setV12RemoteInsp({ status: "error", info: null, error: r.error.message });
        return;
      }
      const base = r.data.info;
      setV12RemoteInsp({ status: "ready", info: base, error: "", detailsLoading: isDirectory });
      if (!isDirectory) return;
      unsubscribeSize = window.cofinder.remote.onDirectorySizeUpdate((payload) => {
        if (token !== v12RemoteInspTokenRef.current) return;
        if (payload.jobId !== sizeJobId || payload.connectionId !== conn || payload.path !== path) return;
        if (payload.status === "success") {
          setV12RemoteInsp((prev) => ({
            ...prev,
            info: prev.info ? { ...prev.info, size: payload.size ?? prev.info.size } : prev.info,
            detailsLoading: false,
            detailsError: payload.capped ? "Size calculation was capped." : ""
          }));
          unsubscribeSize?.();
          unsubscribeSize = null;
        } else if (payload.status === "failed") {
          setV12RemoteInsp((prev) => ({ ...prev, detailsLoading: false, detailsError: payload.error ?? "Failed to calculate directory size." }));
          unsubscribeSize?.();
          unsubscribeSize = null;
        }
      });
      const sizeStart = await window.cofinder.remote.directorySizeStart({ connectionId: conn, path });
      if (token !== v12RemoteInspTokenRef.current) return;
      if (!sizeStart.ok) {
        setV12RemoteInsp((prev) => ({ ...prev, detailsLoading: false, detailsError: sizeStart.error.message }));
        unsubscribeSize?.();
        unsubscribeSize = null;
        return;
      }
      sizeJobId = sizeStart.data.jobId;
    })();
    return () => {
      const job = sizeJobId;
      unsubscribeSize?.();
      if (job) void window.cofinder.remote.directorySizeCancel({ jobId: job });
    };
  }, [uiShell, remotePane.connectionId, remotePane.selectedFullPaths, remotePane.entries, activeTab.id, v12RemoteInspectorReveal]);

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

  function basenameRemotePath(input: string): string {
    const parts = input.split("/").filter(Boolean);
    return parts.at(-1) ?? input;
  }

  function remoteEditTransferTaskId(sessionId: string): string {
    return `remote-edit-${sessionId}`;
  }

  function remoteEditSessionToTransferTask(session: RemoteEditSession): TransferTask {
    const uploadedAt = session.lastUploadedAt ?? Date.now();
    const remoteName = basenameRemotePath(session.remotePath);
    return {
      id: remoteEditTransferTaskId(session.id),
      tabId: session.tabId,
      direction: "upload",
      source: session.localPath,
      destination: session.remotePath,
      sourceDisplay: remoteName,
      destinationDisplay: session.remotePath,
      connectionId: session.connectionId,
      host: "",
      port: 22,
      username: "",
      remotePath: session.remotePath,
      localPath: session.localPath,
      status: "success",
      progressText: `Remote edit uploaded ${new Date(uploadedAt).toLocaleTimeString()}`,
      currentFile: remoteName,
      rawLog: ["Remote edit uploaded successfully."],
      createdAt: uploadedAt,
      startedAt: uploadedAt,
      finishedAt: uploadedAt
    };
  }

  function formatRemoteEditUploadTime(session: RemoteEditSession): string {
    if (!session.lastUploadedAt) return "Not uploaded yet";
    return `Uploaded ${new Date(session.lastUploadedAt).toLocaleTimeString()}`;
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
                currentPath: initialPath || homePath || "/",
                pathInput: initialPath || homePath || "/",
                entries: [],
                isListing: true,
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
    const restoredRemotePath =
      appSettings.general.restoreLastSession && profileId ? remoteRecentPathsByProfile[profileId]?.[0]?.path : "";
    const initialPath = restoredRemotePath || attempt.defaultRemotePathTrimmed || homePath || "/";

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
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id !== tabId ||
        (tab.remotePane.connectionId !== connectionId && tab.remotePane.connectionStatus !== "connecting")
          ? tab
          : {
              ...tab,
              remotePane: {
                ...tab.remotePane,
                error: "",
                isListing: true,
                pathInput: targetPath || tab.remotePane.currentPath
              }
            }
      )
    );
    const result = await window.cofinder.remote.listDirectory({
      connectionId,
      path: targetPath
    });
    if (!result.ok) {
      if (result.error.code === "REMOTE_DISCONNECTED") {
        markRemoteDisconnected(tabId, connectionId, result.error.message);
        return false;
      }
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
                  pathInput: previousPath || targetPath,
                  isListing: false
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
            isListing: false,
            history: computeHistory(tab.remotePane.history, mode, previousPath, payload.path)
          }
        };
      })
    );
    const profileId = tabs.find((tab) => tab.id === tabId)?.remotePane.activeProfileId;
    rememberRemoteRecent(profileId, payload.path);
    return true;
  }

  function markRemoteDisconnected(tabId: string, connectionId: string, message: string): void {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id !== tabId || tab.remotePane.connectionId !== connectionId
          ? tab
          : {
              ...tab,
              remotePane: {
                ...tab.remotePane,
                connectionStatus: "disconnected",
                connectionId: null,
                error: message,
                entries: [],
                selectedFullPaths: [],
                selectionAnchorFullPath: null,
                isListing: false
              }
            }
      )
    );
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
              sortedEntries,
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
        cancelV12LocalInspRevealTimer();
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
              sortedRemoteEntries,
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
        cancelV12RemoteInspRevealTimer();
      }
    }
  }

  function moveSelectionByKeyboard(tabId: string, pane: ActivePane, direction: -1 | 1, extend: boolean): void {
    setActivePane(pane);
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        if (pane === "local") {
          return {
            ...tab,
            localPane: {
              ...tab.localPane,
              ...applyKeyboardRowSelection(
                sortedEntries,
                {
                  selectedFullPaths: tab.localPane.selectedFullPaths,
                  selectionAnchorFullPath: tab.localPane.selectionAnchorFullPath
                },
                direction,
                { extend }
              )
            }
          };
        }
        return {
          ...tab,
          remotePane: {
            ...tab.remotePane,
            ...applyKeyboardRowSelection(
              sortedRemoteEntries,
              {
                selectedFullPaths: tab.remotePane.selectedFullPaths,
                selectionAnchorFullPath: tab.remotePane.selectionAnchorFullPath
              },
              direction,
              { extend }
            )
          }
        };
      })
    );
    if (uiShell === "v12") {
      if (pane === "local") cancelV12LocalInspRevealTimer();
      else cancelV12RemoteInspRevealTimer();
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
    entry: LocalFileEntry | RemoteFileEntry,
    event: { clientX: number; clientY: number }
  ): void {
    setActivePane(pane);
    const entryPath = entry.fullPath;
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
    setContextMenu({
      pane,
      tabId,
      x: event.clientX,
      y: event.clientY,
      scope: "row",
      terminalPath: entry.type === "directory" ? entry.fullPath : getParentPath(entry.fullPath)
    });
  }

  function openBackgroundContextMenu(tabId: string, pane: "local" | "remote", event: { clientX: number; clientY: number }): void {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    setActivePane(pane);
    setContextMenu({
      pane,
      tabId,
      x: event.clientX,
      y: event.clientY,
      scope: "background",
      terminalPath: pane === "local" ? tab.localPane.currentPath : tab.remotePane.currentPath
    });
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

  async function copyCurrentPath(pane: ActivePane = activePane): Promise<void> {
    const pathToCopy = pane === "local" ? localPane.currentPath : remotePane.currentPath;
    if (!pathToCopy || (pane === "remote" && !remotePane.connectionId)) return;
    const result = await window.cofinder.system.copyText({ text: pathToCopy });
    if (!result.ok) setQueueError(result.error.message);
  }

  function beginPathEdit(pane: ActivePane): void {
    if (pane === "remote" && !remotePane.connectionId) return;
    setActivePane(pane);
    setTabs((prev) =>
      prev.map((item) =>
        item.id !== activeTab.id
          ? item
          : pane === "local"
            ? { ...item, localPane: { ...item.localPane, pathInput: item.localPane.currentPath } }
            : { ...item, remotePane: { ...item.remotePane, pathInput: item.remotePane.currentPath } }
      )
    );
    setPathEditPane(pane);
  }

  function cancelPathEdit(pane: ActivePane): void {
    setTabs((prev) =>
      prev.map((item) =>
        item.id !== activeTab.id
          ? item
          : pane === "local"
            ? { ...item, localPane: { ...item.localPane, pathInput: item.localPane.currentPath } }
            : { ...item, remotePane: { ...item.remotePane, pathInput: item.remotePane.currentPath } }
      )
    );
    setPathEditPane((current) => (current === pane ? null : current));
  }

  async function submitPathEdit(pane: ActivePane): Promise<void> {
    if (pane === "local") {
      const ok = await navigateLocal(activeTab.id, localPane.pathInput);
      if (ok) setPathEditPane(null);
      return;
    }
    if (!remotePane.connectionId) return;
    const ok = await listRemotePath(remotePane.connectionId, remotePane.pathInput, "push", activeTab.id);
    if (ok) setPathEditPane(null);
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
    const target = deleteConfirm;
    setDeleteConfirm(null);
    await performDelete(target);
  }

  async function performDelete(target: DeleteConfirmState): Promise<void> {
    const deleteKey = deleteOperationKey(target);
    if (deleteInFlightKeysRef.current.has(deleteKey)) return;
    deleteInFlightKeysRef.current.add(deleteKey);
    setDeleteBusy(target.tabId, target.pane, `Deleting ${target.paths.length} ${target.paths.length === 1 ? "item" : "items"}...`);
    if (target.pane === "local") {
      const tab = tabs.find((item) => item.id === target.tabId);
      if (!tab) {
        finishDeleteOperation(deleteKey, target.tabId, target.pane);
        return;
      }
      try {
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
      } finally {
        finishDeleteOperation(deleteKey, target.tabId, target.pane);
      }
      return;
    }

    if (!target.connectionId) {
      finishDeleteOperation(deleteKey, target.tabId, target.pane);
      return;
    }
    const tab = tabs.find((item) => item.id === target.tabId);
    if (!tab) {
      finishDeleteOperation(deleteKey, target.tabId, target.pane);
      return;
    }
    try {
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
    } finally {
      finishDeleteOperation(deleteKey, target.tabId, target.pane);
    }
  }

  function setDeleteBusy(tabId: string, pane: ActivePane, message: string): void {
    setDeleteBusyByTab((prev) => ({
      ...prev,
      [tabId]: {
        ...(prev[tabId] ?? {}),
        [pane]: message
      }
    }));
  }

  function clearDeleteBusy(tabId: string, pane: ActivePane): void {
    setDeleteBusyByTab((prev) => {
      const current = prev[tabId];
      if (!current?.[pane]) return prev;
      const nextPane = { ...current };
      delete nextPane[pane];
      const next = { ...prev };
      if (Object.keys(nextPane).length === 0) delete next[tabId];
      else next[tabId] = nextPane;
      return next;
    });
  }

  function finishDeleteOperation(key: string, tabId: string, pane: ActivePane): void {
    deleteInFlightKeysRef.current.delete(key);
    clearDeleteBusy(tabId, pane);
  }

  function deleteOperationKey(target: DeleteConfirmState): string {
    return `${target.pane}\u0000${target.tabId}\u0000${target.connectionId ?? ""}\u0000${target.paths.slice().sort().join("\u0000")}`;
  }

  async function openInfoDialog(tabId: string, pane: "local" | "remote"): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "local") {
      if (tab.localPane.selectedFullPaths.length === 0) return;
      setActivePane("local");
      cancelV12LocalInspRevealTimer();
      setV12LocalInspectorReveal(true);
      return;
    }

    if (tab.remotePane.selectedFullPaths.length === 0 || !tab.remotePane.connectionId) return;
    setActivePane("remote");
    cancelV12RemoteInspRevealTimer();
    setV12RemoteInspectorReveal(true);
  }

  function toggleInspectorFromShortcut(tabId: string, pane: ActivePane): void {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "local") {
      if (!inspectorColumnVisible("local", tab.localPane.selectedFullPaths.length, remoteConnected)) return;
      setActivePane("local");
      cancelV12LocalInspRevealTimer();
      setV12LocalInspectorReveal((visible) => !visible);
      return;
    }
    if (!inspectorColumnVisible("remote", tab.remotePane.selectedFullPaths.length, !!tab.remotePane.connectionId)) return;
    setActivePane("remote");
    cancelV12RemoteInspRevealTimer();
    setV12RemoteInspectorReveal((visible) => !visible);
  }

  async function createRemoteDirectory(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.remotePane.connectionId) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "Connect to a remote server first." } } : item
        )
      );
      return;
    }
    setCreateFolderDialog({ pane: "remote", kind: "folder", tabId, name: "New Folder", error: "", busy: false });
  }

  async function createLocalDirectory(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.localPane.currentPath) return;
    setCreateFolderDialog({ pane: "local", kind: "folder", tabId, name: "New Folder", error: "", busy: false });
  }

  async function submitCreateFolderDialog(): Promise<void> {
    if (!createFolderDialog || createFolderDialog.busy) return;
    const draft = createFolderDialog;
    const name = draft.name.trim();
    if (!name) {
      setCreateFolderDialog((prev) => (prev ? { ...prev, error: `${draft.kind === "folder" ? "Folder" : "File"} name is required.` } : prev));
      return;
    }
    setCreateFolderDialog((prev) => (prev ? { ...prev, error: "", busy: true } : prev));
    if (draft.kind === "textFile") {
      if (draft.pane === "local") {
        await performCreateLocalTextFile(draft.tabId, name);
        return;
      }
      await performCreateRemoteTextFile(draft.tabId, name);
      return;
    }
    if (draft.pane === "local") {
      await performCreateLocalDirectory(draft.tabId, name);
      return;
    }
    await performCreateRemoteDirectory(draft.tabId, name);
  }

  async function performCreateRemoteDirectory(tabId: string, name: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.remotePane.connectionId) {
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: "Connect to a remote server first." } : prev));
      return;
    }
    const result = await window.cofinder.remote.mkdir({
      connectionId: tab.remotePane.connectionId,
      parentPath: tab.remotePane.currentPath,
      name
    });
    if (!result.ok) {
      if (result.error.code === "REMOTE_DISCONNECTED") {
        markRemoteDisconnected(tabId, tab.remotePane.connectionId, result.error.message);
      }
      setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item)));
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: result.error.message } : prev));
      return;
    }
    await listRemotePath(tab.remotePane.connectionId, tab.remotePane.currentPath, "replace", tabId);
    setCreateFolderDialog(null);
  }

  async function performCreateLocalDirectory(tabId: string, name: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.localPane.currentPath) {
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: "Select a local folder first." } : prev));
      return;
    }
    const result = await window.cofinder.local.mkdir({
      parentPath: tab.localPane.currentPath,
      name
    });
    if (!result.ok) {
      setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item)));
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: result.error.message } : prev));
      return;
    }
    await navigateLocal(tabId, tab.localPane.currentPath, "replace");
    setCreateFolderDialog(null);
  }

  async function createTextFile(tabId: string, pane: ActivePane): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "local") {
      if (!tab.localPane.currentPath) return;
      setCreateFolderDialog({ pane: "local", kind: "textFile", tabId, name: "Untitled.txt", error: "", busy: false });
      return;
    }
    if (!tab.remotePane.connectionId) {
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: "Connect to a remote server first." } } : item
        )
      );
      return;
    }
    setCreateFolderDialog({ pane: "remote", kind: "textFile", tabId, name: "Untitled.txt", error: "", busy: false });
  }

  async function performCreateLocalTextFile(tabId: string, name: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.localPane.currentPath) {
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: "Select a local folder first." } : prev));
      return;
    }
    const result = await window.cofinder.local.createTextFile({ parentPath: tab.localPane.currentPath, name });
    if (!result.ok) {
      setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, localPane: { ...item.localPane, error: result.error.message } } : item)));
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: result.error.message } : prev));
      return;
    }
    await navigateLocal(tabId, tab.localPane.currentPath, "replace");
    setCreateFolderDialog(null);
  }

  async function performCreateRemoteTextFile(tabId: string, name: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.remotePane.connectionId) {
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: "Connect to a remote server first." } : prev));
      return;
    }
    const result = await window.cofinder.remote.createTextFile({
      connectionId: tab.remotePane.connectionId,
      parentPath: tab.remotePane.currentPath,
      name
    });
    if (!result.ok) {
      if (result.error.code === "REMOTE_DISCONNECTED") {
        markRemoteDisconnected(tabId, tab.remotePane.connectionId, result.error.message);
      }
      setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item)));
      setCreateFolderDialog((prev) => (prev ? { ...prev, busy: false, error: result.error.message } : prev));
      return;
    }
    await listRemotePath(tab.remotePane.connectionId, tab.remotePane.currentPath, "replace", tabId);
    setCreateFolderDialog(null);
  }

  async function chmodRemoteSelection(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    const targetPath = tab?.remotePane.selectedFullPaths[0];
    if (!tab?.remotePane.connectionId || !targetPath || tab.remotePane.selectedFullPaths.length !== 1) return;
    const entry = tab.remotePane.entries.find((item) => item.fullPath === targetPath);
    const mode = window.prompt("Remote permissions mode (octal)", entry?.permissions ? rwxToOctal(entry.permissions) : "644");
    if (!mode) return;
    const result = await window.cofinder.remote.chmod({ connectionId: tab.remotePane.connectionId, path: targetPath, mode });
    if (!result.ok) {
      setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item)));
      return;
    }
    await listRemotePath(tab.remotePane.connectionId, tab.remotePane.currentPath, "replace", tabId);
  }

  async function duplicateRemoteSelection(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    const targetPath = tab?.remotePane.selectedFullPaths[0];
    if (!tab?.remotePane.connectionId || !targetPath || tab.remotePane.selectedFullPaths.length !== 1) return;
    const result = await window.cofinder.remote.duplicate({ connectionId: tab.remotePane.connectionId, path: targetPath });
    if (!result.ok) {
      setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: result.error.message } } : item)));
      return;
    }
    await listRemotePath(tab.remotePane.connectionId, tab.remotePane.currentPath, "replace", tabId);
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId
          ? { ...item, remotePane: { ...item.remotePane, selectedFullPaths: [result.data.newPath], selectionAnchorFullPath: result.data.newPath } }
          : item
      )
    );
  }

  async function openTerminalHere(tabId: string, pane: "local" | "remote", targetPath?: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "local") {
      const result = await window.cofinder.system.openTerminal({ path: targetPath || tab.localPane.currentPath });
      if (!result.ok) setQueueError(result.error.message);
      return;
    }
    if (!tab.remotePane.host || !tab.remotePane.username || !tab.remotePane.port) return;
    const result = await window.cofinder.system.openSshTerminal({
      host: tab.remotePane.host,
      username: tab.remotePane.username,
      port: tab.remotePane.port,
      remotePath: targetPath || tab.remotePane.currentPath
    });
    if (!result.ok) setQueueError(result.error.message);
  }

  async function quickLookSelection(tabId: string, pane: "local" | "remote"): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (pane === "remote") {
      await previewRemoteSelection(tabId);
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
    : remotePane.connectionStatus === "failed" && remotePane.error
        ? remotePane.error
        : "";

  const remoteBadgeV12 =
    !remoteConnected && remotePane.connectionStatus !== "connecting" ? (
      <span className="v12m-badge v12m-badge-off">Offline</span>
    ) : remotePane.connectionStatus === "connecting" ? (
      <span className="v12m-badge v12m-badge-wait">Connecting…</span>
    ) : remotePane.connectionStatus === "failed" ? (
      <span className="v12m-badge v12m-badge-err">Error</span>
    ) : (
      <details className="v12m-status-menu">
        <summary className="v12m-badge v12m-badge-ok" title="Connection actions">
          <span className="v12m-badge-dot" aria-hidden />
          Connected
        </summary>
        <div className="v12m-status-popover">
          <button type="button" className="v12m-status-action is-danger" onClick={() => void disconnectRemote(activeTab.id)}>
            <V12TbIcon name="plug" />
            Disconnect
          </button>
        </div>
      </details>
    );

  function expandOrCollapseQueueFromV12Drawer(): void {
    if (queuePanelState === "hidden" || queuePanelState === "collapsed") setQueuePanelState("expanded");
    else if (queuePanelState === "expanded" || queuePanelState === "autoHidePending") setQueuePanelState("collapsed");
  }

  const localInspectorCanShow = inspectorColumnVisible("local", localPane.selectedFullPaths.length, remoteConnected);
  const remoteInspectorCanShow = inspectorColumnVisible("remote", remotePane.selectedFullPaths.length, remoteConnected);

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
      tasks={drawerTransferTasks}
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

  const visibleRemoteEditSessions = remoteEditSessions.filter((session) => session.state !== "uploaded");
  const remoteEditStatusPanel =
    visibleRemoteEditSessions.length > 0 ? (
      <section className="remote-edit-panel" aria-label="Remote edit sessions">
        <div className="remote-edit-head">
          <strong>Remote edits</strong>
          <span>
            {visibleRemoteEditSessions.length} active ·{" "}
            {visibleRemoteEditSessions.filter((session) => session.state === "failed" || session.state === "conflict").length} need attention
          </span>
        </div>
        <div className="remote-edit-list">
          {visibleRemoteEditSessions.map((session) => (
            <div key={session.id} className={`remote-edit-row state-${session.state}`}>
              <span className={`remote-edit-state state-${session.state}`}>{session.state}</span>
              <span className="remote-edit-path" title={session.remotePath}>
                {basenameRemotePath(session.remotePath)}
              </span>
              <span className="remote-edit-local" title={session.localPath}>
                {formatRemoteEditUploadTime(session)}
              </span>
              {session.error ? (
                <span className="remote-edit-error" title={session.error}>
                  {session.error}
                </span>
              ) : null}
              <span className="remote-edit-actions">
                <button type="button" className="toolbar-button" onClick={() => void revealRemoteEditCopy(session.id)}>
                  Reveal
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  disabled={session.state === "uploading"}
                  onClick={() => void saveRemoteEditNow(session.id)}
                >
                  Save Back Now
                </button>
                {session.state === "conflict" || session.state === "failed" ? (
                  <>
                    <button type="button" className="toolbar-button" onClick={() => void redownloadRemoteEdit(session.id)}>
                      Re-download
                    </button>
                    <button type="button" className="toolbar-button" onClick={() => void forceUploadRemoteEdit(session.id)}>
                      Force upload
                    </button>
                    <button type="button" className="toolbar-button" onClick={() => void downloadRemoteConflictCopy(session.id)}>
                      Remote Copy
                    </button>
                    <button type="button" className="toolbar-button" onClick={() => void copyRemoteEditConflictPaths(session.id)}>
                      Copy Paths
                    </button>
                  </>
                ) : null}
                <button type="button" className="toolbar-button" onClick={() => void stopRemoteEditMonitoring(session.id)}>
                  Stop
                </button>
                <button type="button" className="toolbar-button" onClick={() => void discardRemoteEditCopy(session.id)}>
                  Discard
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    ) : null;

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

  async function editRemoteSelection(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    const target = tab?.remotePane.selectedFullPaths[0];
    if (!tab?.remotePane.connectionId || !target || tab.remotePane.selectedFullPaths.length !== 1) return;
    const res = await window.cofinder.remote.editOpen({
      tabId,
      connectionId: tab.remotePane.connectionId,
      path: target
    });
    if (!res.ok) {
      if (res.error.code === "REMOTE_DISCONNECTED") {
        markRemoteDisconnected(tabId, tab.remotePane.connectionId, res.error.message);
        return;
      }
      setTabs((prev) =>
        prev.map((item) =>
          item.id === tabId ? { ...item, remotePane: { ...item.remotePane, error: res.error.message } } : item
        )
      );
      return;
    }
    setQueueError(`Editing ${target}`);
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
      if (res.error.code === "REMOTE_DISCONNECTED") {
        markRemoteDisconnected(tabId, tab.remotePane.connectionId, res.error.message);
        return;
      }
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
    <div className={`nav-efficiency-bar ${uiShell === "v12" ? "nav-efficiency-bar--no-path" : ""}`}>
      {uiShell === "v12" ? null : (
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
      )}
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
    <div className={`nav-efficiency-bar ${uiShell === "v12" ? "nav-efficiency-bar--no-path" : ""}`}>
      {uiShell === "v12" ? null : (
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
      )}
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

  const localPaneToolbar =
    uiShell === "v12" ? (
      <V12PaneToolbar
        label="Local pane toolbar"
        actions={[
          {
            label: "Back",
            title: "Back",
            icon: "chevron-back",
            tone: "nav",
            disabled: localPane.history.backStack.length === 0,
            onClick: () => {
              const target = localPane.history.backStack[localPane.history.backStack.length - 1];
              if (target) void navigateLocal(activeTab.id, target, "back");
            }
          },
          {
            label: "Forward",
            title: "Forward",
            icon: "chevron-forward",
            tone: "nav",
            disabled: localPane.history.forwardStack.length === 0,
            onClick: () => {
              const target = localPane.history.forwardStack[0];
              if (target) void navigateLocal(activeTab.id, target, "forward");
            }
          },
          {
            label: "Enclosing folder",
            title: "Enclosing folder",
            icon: "chevron-up",
            tone: "nav",
            onClick: () => void navigateLocal(activeTab.id, getParentPath(localPane.currentPath))
          },
          {
            label: "Home",
            title: "Home",
            icon: "home",
            tone: "nav",
            disabled: !localHomePath,
            onClick: () => {
              if (localHomePath) void navigateLocal(activeTab.id, localHomePath, "push");
              else void initializeLocalHome(activeTab.id);
            }
          },
          {
            label: "Refresh",
            title: "Refresh",
            icon: "arrow-clockwise",
            tone: "nav",
            disabled: !localPane.currentPath,
            onClick: () => void navigateLocal(activeTab.id, localPane.currentPath, "replace")
          },
          {
            label: "Toggle local inspector",
            title: "Toggle inspector",
            icon: "sidebar-right",
            disabled: !localInspectorCanShow || localPane.selectedFullPaths.length === 0,
            pressed: v12LocalInspectorReveal,
            onClick: () => {
              cancelV12LocalInspRevealTimer();
              setV12LocalInspectorReveal((v) => !v);
            }
          },
          {
            label: "Upload",
            title: "Upload local selection to remote pane",
            icon: "arrow-up-tray",
            tone: "transfer",
            disabled: localPane.selectedFullPaths.length === 0 || !remotePane.connectionId,
            onClick: () => void enqueueUpload(activeTab.id)
          },
          {
            label: "New local folder",
            title: "New local folder",
            icon: "folder-badge-plus",
            tone: "create",
            disabled: !localPane.currentPath,
            onClick: () => void createLocalDirectory(activeTab.id)
          },
          {
            label: "New local text file",
            title: "New local text file",
            icon: "doc-badge-plus",
            tone: "create",
            disabled: !localPane.currentPath,
            onClick: () => void createTextFile(activeTab.id, "local")
          },
          {
            label: "Delete local selection",
            title: "Delete local selection",
            icon: "trash",
            disabled: localPane.selectedFullPaths.length === 0,
            danger: true,
            onClick: () => openDeleteConfirm(activeTab.id, "local")
          },
          {
            label: "Open Terminal Here",
            title: "Open Terminal here in local current folder",
            icon: "terminal",
            disabled: !localPane.currentPath,
            onClick: () => void openTerminalHere(activeTab.id, "local", localPane.currentPath)
          }
        ]}
      >
        <input
          className="pane-filter-input"
          value={localPane.filterText}
          onChange={(event) => updateLocalFilter(activeTab.id, event.target.value)}
          placeholder="Filter names"
          aria-label="Filter local files by name"
        />
        <div className="v12m-pane-toolbar-history-group">
          <V12ToolbarIconSelect
            label="Local recent locations"
            title="Recent locations"
            icon="clock"
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
          </V12ToolbarIconSelect>
          <V12ToolbarIconSelect
            label="Local back and forward history"
            title="Back and forward history"
            icon="history"
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
          </V12ToolbarIconSelect>
          <button
            type="button"
            className="toolbar-button v12m-icon-button"
            title="Clear recent locations"
            aria-label="Clear recent locations"
            disabled={localRecentPaths.length === 0}
            onClick={clearLocalRecents}
          >
            <V12TbIcon name="clear-clock" />
          </button>
        </div>
      </V12PaneToolbar>
    ) : null;

  const remotePaneToolbar =
    uiShell === "v12" ? (
      <V12PaneToolbar
        label="Remote pane toolbar"
        actions={[
          {
            label: "Back",
            title: "Back",
            icon: "chevron-back",
            tone: "nav",
            disabled: remotePane.history.backStack.length === 0 || !remotePane.connectionId,
            onClick: () => {
              const target = remotePane.history.backStack[remotePane.history.backStack.length - 1];
              if (target && remotePane.connectionId) void listRemotePath(remotePane.connectionId, target, "back", activeTab.id);
            }
          },
          {
            label: "Forward",
            title: "Forward",
            icon: "chevron-forward",
            tone: "nav",
            disabled: remotePane.history.forwardStack.length === 0 || !remotePane.connectionId,
            onClick: () => {
              const target = remotePane.history.forwardStack[0];
              if (target && remotePane.connectionId) void listRemotePath(remotePane.connectionId, target, "forward", activeTab.id);
            }
          },
          {
            label: "Enclosing folder",
            title: "Enclosing folder",
            icon: "chevron-up",
            tone: "nav",
            disabled: !remotePane.connectionId,
            onClick: () => {
              if (remotePane.connectionId) void listRemotePath(remotePane.connectionId, getParentPath(remotePane.currentPath), "push", activeTab.id);
            }
          },
          {
            label: "Home",
            title: "Home",
            icon: "home",
            tone: "nav",
            disabled: !remotePane.connectionId,
            onClick: () => {
              if (remotePane.connectionId) void listRemotePath(remotePane.connectionId, remotePane.homePath || "/", "push", activeTab.id);
            }
          },
          {
            label: "Refresh",
            title: "Refresh",
            icon: "arrow-clockwise",
            tone: "nav",
            disabled: !remotePane.connectionId,
            onClick: () => {
              if (remotePane.connectionId) void listRemotePath(remotePane.connectionId, remotePane.currentPath, "replace", activeTab.id);
            }
          },
          {
            label: "Toggle remote inspector",
            title: "Toggle inspector",
            icon: "sidebar-right",
            disabled: !remoteInspectorCanShow || remotePane.selectedFullPaths.length === 0,
            pressed: v12RemoteInspectorReveal,
            onClick: () => {
              cancelV12RemoteInspRevealTimer();
              setV12RemoteInspectorReveal((v) => !v);
            }
          },
          {
            label: "Download",
            title: "Download remote selection to local pane",
            icon: "arrow-down-tray",
            tone: "transfer",
            disabled: remotePane.selectedFullPaths.length === 0 || !localPane.currentPath || !remotePane.connectionId,
            onClick: () => void enqueueDownload(activeTab.id)
          },
          {
            label: "Edit",
            title: "Edit",
            icon: "pencil",
            tone: "edit",
            disabled: remotePane.selectedFullPaths.length !== 1 || !remotePane.connectionId,
            onClick: () => void editRemoteSelection(activeTab.id)
          },
          {
            label: "New remote folder",
            title: "New remote folder",
            icon: "folder-badge-plus",
            tone: "create",
            disabled: !remotePane.connectionId,
            onClick: () => void createRemoteDirectory(activeTab.id)
          },
          {
            label: "New remote text file",
            title: "New remote text file",
            icon: "doc-badge-plus",
            tone: "create",
            disabled: !remotePane.connectionId,
            onClick: () => void createTextFile(activeTab.id, "remote")
          },
          {
            label: "Delete remote selection",
            title: "Delete remote selection",
            icon: "trash",
            disabled: remotePane.selectedFullPaths.length === 0 || !remotePane.connectionId,
            danger: true,
            onClick: () => openDeleteConfirm(activeTab.id, "remote")
          },
          {
            label: "Open SSH Terminal Here",
            title: "Open SSH Terminal here in remote current folder",
            icon: "terminal",
            disabled: !remotePane.connectionId,
            onClick: () => void openTerminalHere(activeTab.id, "remote", remotePane.currentPath)
          }
        ]}
      >
        <input
          className="pane-filter-input"
          value={remotePane.filterText}
          disabled={!remotePane.connectionId}
          onChange={(event) => updateRemoteFilter(activeTab.id, event.target.value)}
          placeholder="Filter names"
          aria-label="Filter remote files by name"
        />
        <div className="v12m-pane-toolbar-history-group">
          <V12ToolbarIconSelect
            label="Remote recent locations"
            title="Recent locations"
            icon="clock"
            disabled={!remotePane.connectionId || remoteRecentPaths.length === 0}
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
          </V12ToolbarIconSelect>
          <V12ToolbarIconSelect
            label="Remote back and forward history"
            title="Back and forward history"
            icon="history"
            disabled={!remotePane.connectionId}
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
          </V12ToolbarIconSelect>
          <button
            type="button"
            className="toolbar-button v12m-icon-button"
            title="Clear recent locations"
            aria-label="Clear recent locations"
            disabled={!activeProfile?.id || remoteRecentPaths.length === 0}
            onClick={() => clearRemoteRecents(activeProfile?.id)}
          >
            <V12TbIcon name="clear-clock" />
          </button>
        </div>
      </V12PaneToolbar>
    ) : null;

  const v12LocalFileColumns = useMemo(() => buildV12FileColumns(v12FileColumnSettings.local), [v12FileColumnSettings.local]);
  const v12RemoteFileColumns = useMemo(() => buildV12FileColumns(v12FileColumnSettings.remote), [v12FileColumnSettings.remote]);

  function updateV12ColumnWidth(pane: ActivePane, key: V12FileColumnKey, width: number): void {
    setV12FileColumnSettings((prev) => ({
      ...prev,
      [pane]: {
        ...prev[pane],
        [key]: {
          width: Math.round(width),
          visible: key === "name" ? true : prev[pane][key]?.visible ?? V12_DEFAULT_COLUMNS.find((column) => column.key === key)?.visible ?? true
        }
      }
    }));
  }

  function updateV12ColumnVisibility(pane: ActivePane, key: V12FileColumnKey, visible: boolean): void {
    if (key === "name") return;
    setV12FileColumnSettings((prev) => ({
      ...prev,
      [pane]: {
        ...prev[pane],
        [key]: {
          width: prev[pane][key]?.width ?? V12_DEFAULT_COLUMNS.find((column) => column.key === key)?.width ?? 90,
          visible
        }
      }
    }));
  }

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
              editingPath={pathEditPane === "local"}
              pathInput={localPane.pathInput}
              onBeginPathInput={() => beginPathEdit("local")}
              onPathInputChange={(value) =>
                setTabs((prev) =>
                  prev.map((tab) => (tab.id === activeTab.id ? { ...tab, localPane: { ...tab.localPane, pathInput: value } } : tab))
                )
              }
              onSubmitPathInput={() => void submitPathEdit("local")}
              onCancelPathInput={() => cancelPathEdit("local")}
              onCopyPath={() => void copyCurrentPath("local")}
            />
            {localPaneToolbar}
          </div>
          <div className="v12m-pane-body">
            <div className="v12m-pane-split">
              <div className="v12m-pane-main v12m-pane-main--stack">
                {localDeleteBusy ? <div className="cfv12p-busy">{localDeleteBusy}</div> : null}
                {localPane.error ? <div className="cfv12p-error">{localPane.error}</div> : null}
                <V12VisualFileList
                  pane="local"
                  isPaneActive={activePane === "local"}
                  entries={sortedEntries}
                  emptyMessage={localPane.error ? "Local folder could not be loaded." : "This local folder is empty."}
                  sortKey={localPane.sortKey}
                  sortDirection={localPane.sortDirection}
                  selectedFullPaths={localPane.selectedFullPaths}
                  columns={v12LocalFileColumns}
                  onColumnWidthChange={(key, width) => updateV12ColumnWidth("local", key, width)}
                  onColumnVisibilityChange={(key, visible) => updateV12ColumnVisibility("local", key, visible)}
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
                  onRowDetailClick={(_, event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setActivePane("local");
                    lastPlainClickRef.current = null;
                    cancelV12LocalInspRevealTimer();
                    clearLocalSelection(activeTab.id);
                  }}
                  onRowContextMenu={(entry, event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openContextMenu(activeTab.id, "local", entry, event);
                  }}
                  onRowDoubleClick={(entry) => {
                    if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                    void handleRowDoubleClick(activeTab.id, entry);
                  }}
                  onBackgroundMouseDown={(event) => {
                    beginMarqueeSelection("local", event);
                  }}
                  onBackgroundContextMenu={(event) => {
                    event.preventDefault();
                    openBackgroundContextMenu(activeTab.id, "local", event);
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
                  detailsLoading={localPane.selectedFullPaths.length === 1 && v12LocalInsp.detailsLoading}
                  detailsError={localPane.selectedFullPaths.length === 1 ? v12LocalInsp.detailsError : ""}
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
            <button
              type="button"
              className="toolbar-button"
              disabled={!localPane.currentPath}
              onClick={() => void createLocalDirectory(activeTab.id)}
            >
              New Folder
            </button>
            <button
              type="button"
              className="toolbar-button"
              disabled={!localPane.currentPath}
              onClick={() => void createTextFile(activeTab.id, "local")}
            >
              New Text File
            </button>
            <button type="button" className="toolbar-button" onClick={() => void openTerminalHere(activeTab.id, "local")}>
              Terminal
            </button>
          </div>

          {localNavTools}

          {localDeleteBusy ? <div className="busy-banner">{localDeleteBusy}</div> : null}
          {localPane.error ? <div className="error-banner">{localPane.error}</div> : null}

          <div
            className={`table-wrap ${activePane === "local" ? "table-wrap-active" : ""}`}
            onMouseDown={(event) => {
              beginMarqueeSelection("local", event);
            }}
            onDragOver={(event) => handleTransferDragOver("local", localPane.currentPath, event)}
            onDrop={(event) => void handleTransferDrop("local", localPane.currentPath, event)}
            onDragLeave={handleTransferDragLeave}
            onContextMenu={(event) => {
              event.preventDefault();
              openBackgroundContextMenu(activeTab.id, "local", event);
            }}
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
                      event.stopPropagation();
                      openContextMenu(activeTab.id, "local", entry, event);
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
                pathInputDisabled
                onCopyPath={() => void copyCurrentPath("remote")}
              />
              {remotePaneToolbar}
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
                editingPath={pathEditPane === "remote"}
                pathInput={remotePane.pathInput}
                pathInputDisabled={!remotePane.connectionId}
                onBeginPathInput={() => beginPathEdit("remote")}
                onPathInputChange={(value) =>
                  setTabs((prev) =>
                    prev.map((tab) =>
                      tab.id === activeTab.id ? { ...tab, remotePane: { ...tab.remotePane, pathInput: value } } : tab
                    )
                  )
                }
                onSubmitPathInput={() => void submitPathEdit("remote")}
                onCancelPathInput={() => cancelPathEdit("remote")}
                onCopyPath={() => void copyCurrentPath("remote")}
              />
              {remotePaneToolbar}
            </div>
            <div className="v12m-pane-body">
              <div className="v12m-pane-split">
                <div className="v12m-pane-main v12m-pane-main--stack">
                  {remoteDeleteBusy ? <div className="cfv12p-busy">{remoteDeleteBusy}</div> : null}
                  {remotePane.error ? <div className="cfv12p-error">{remotePane.error}</div> : null}
                  <V12VisualFileList
                    pane="remote"
                    isPaneActive={activePane === "remote"}
                    entries={sortedRemoteEntries}
                    emptyMessage={
                      remotePane.isListing ? "Loading remote folder..." : remotePane.error ? "Remote folder could not be loaded." : "This remote folder is empty."
                    }
                    sortKey={remotePane.sortKey}
                    sortDirection={remotePane.sortDirection}
                    selectedFullPaths={remotePane.selectedFullPaths}
                    columns={v12RemoteFileColumns}
                    onColumnWidthChange={(key, width) => updateV12ColumnWidth("remote", key, width)}
                    onColumnVisibilityChange={(key, visible) => updateV12ColumnVisibility("remote", key, visible)}
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
                    onRowDetailClick={(_, event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setActivePane("remote");
                      lastPlainClickRef.current = null;
                      cancelV12RemoteInspRevealTimer();
                      clearRemoteSelection(activeTab.id);
                    }}
                    onRowContextMenu={(entry, event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openContextMenu(activeTab.id, "remote", entry, event);
                    }}
                    onRowDoubleClick={(entry) => {
                      if (inlineRename && inlineRename.tabId === activeTab.id && inlineRename.sourcePath === entry.fullPath) return;
                      void handleRemoteDoubleClick(activeTab.id, entry);
                    }}
                    onBackgroundMouseDown={(event) => {
                      beginMarqueeSelection("remote", event);
                    }}
                    onBackgroundContextMenu={(event) => {
                      event.preventDefault();
                      openBackgroundContextMenu(activeTab.id, "remote", event);
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
                    detailsLoading={remotePane.selectedFullPaths.length === 1 && v12RemoteInsp.detailsLoading}
                    detailsError={remotePane.selectedFullPaths.length === 1 ? v12RemoteInsp.detailsError : ""}
                    formatSize={formatSize}
                    formatTime={formatTime}
                    hostLabel={`${remotePane.username}@${remotePane.host}:${remotePane.port}`}
                    onCopyPaths={() => void copySelection(activeTab.id, "remote", "path")}
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
                <button type="button" className="toolbar-button" onClick={() => void createRemoteDirectory(activeTab.id)}>
                  New Folder
                </button>
                <button type="button" className="toolbar-button" onClick={() => void createTextFile(activeTab.id, "remote")}>
                  New Text File
                </button>
                <button type="button" className="toolbar-button" onClick={() => void openTerminalHere(activeTab.id, "remote")}>
                  SSH Terminal
                </button>
                <button type="button" className="toolbar-button" onClick={() => void disconnectRemote(activeTab.id)}>
                  Disconnect
                </button>
              </div>

              {remoteNavTools}

              {remoteDeleteBusy ? <div className="busy-banner">{remoteDeleteBusy}</div> : null}
              {remotePane.error ? <div className="error-banner">{remotePane.error}</div> : null}

              <div
                className={`table-wrap ${activePane === "remote" ? "table-wrap-active" : ""}`}
                onMouseDown={(event) => {
                  beginMarqueeSelection("remote", event);
                }}
                onDragOver={(event) => handleTransferDragOver("remote", remotePane.currentPath, event)}
                onDrop={(event) => void handleTransferDrop("remote", remotePane.currentPath, event)}
                onDragLeave={handleTransferDragLeave}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openBackgroundContextMenu(activeTab.id, "remote", event);
                }}
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
                          event.stopPropagation();
                          openContextMenu(activeTab.id, "remote", entry, event);
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
          toolbar={null}
          devHint={import.meta.env.DEV ? <V12ProdDevHint /> : null}
          drawer={
            <>
              {remoteEditStatusPanel}
              {queueV12Drawer}
            </>
          }
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
              <>
                <div className="cfv12-sidebar-wrap" style={{ width: `${appSettings.appearance.sidebarWidth}px` }}>
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
                    onOpenPreferences={openPreferences}
                  />
                </div>
                <div
                  className="cfv12-sidebar-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize sidebar"
                  onMouseDown={beginSidebarResize}
                />
              </>
            ) : null
          }
        />
      )}
      {uiShell === "v11" ? (
        <>
          {remoteEditStatusPanel}
          {queueV11Section}
        </>
      ) : null}
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
                Text editor
                <select
                  value={["system", "TextEdit", "TextMate"].includes(preferences.draft.general.defaultTextEditor) ? preferences.draft.general.defaultTextEditor : "custom"}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      draft: {
                        ...p.draft,
                        general: {
                          ...p.draft.general,
                          defaultTextEditor: e.target.value === "custom" ? "" : e.target.value
                        }
                      }
                    }))
                  }
                >
                  <option value="system">System default</option>
                  <option value="TextEdit">TextEdit</option>
                  <option value="TextMate">TextMate</option>
                  <option value="custom">Custom...</option>
                </select>
                {["system", "TextEdit", "TextMate"].includes(preferences.draft.general.defaultTextEditor) ? null : (
                  <input
                    value={preferences.draft.general.defaultTextEditor}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        draft: { ...p.draft, general: { ...p.draft.general, defaultTextEditor: e.target.value } }
                      }))
                    }
                    placeholder="App name or /Applications/TextMate.app"
                  />
                )}
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
              <div className={`preferences-inline-setting${preferences.draft.remote.autoRefreshEnabled ? "" : " is-disabled"}`}>
                <label className="preferences-check">
                  <input
                    type="checkbox"
                    checked={preferences.draft.remote.autoRefreshEnabled}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        draft: { ...p.draft, remote: { ...p.draft.remote, autoRefreshEnabled: e.target.checked } }
                      }))
                    }
                  />
                  Auto-refresh remote pane
                </label>
                <label>
                  Every
                  <input
                    type="number"
                    min={5}
                    max={3600}
                    disabled={!preferences.draft.remote.autoRefreshEnabled}
                    value={preferences.draft.remote.autoRefreshIntervalSeconds}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        draft: {
                          ...p.draft,
                          remote: {
                            ...p.draft.remote,
                            autoRefreshIntervalSeconds: Math.max(5, Math.min(3600, Math.round(Number(e.target.value) || 60)))
                          }
                        }
                      }))
                    }
                  />
                </label>
                <span>seconds</span>
              </div>
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
                ["Restore last local path and remote profile paths", "restoreLastSession"],
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
              <p>F2 rename · Delete remove · Cmd+I info · Cmd+Shift+C copy selected path · Cmd+Option+C copy current path · Cmd+R refresh · Cmd+U upload · Cmd+D download · Cmd+K Site Manager</p>
            </div>
            <div className="preferences-shortcuts">
              <strong>Diagnostics</strong>
              <div className="diagnostics-actions">
                <button type="button" className="toolbar-button" onClick={() => void copyDiagnostics()}>
                  Copy Diagnostics
                </button>
                <button type="button" className="toolbar-button" onClick={() => void openLogFolder()}>
                  Open Log Folder
                </button>
                <button type="button" className="toolbar-button" onClick={() => void openLogFile()}>
                  Open Log File
                </button>
                <button type="button" className="toolbar-button" onClick={() => void checkForUpdates()}>
                  Check for Updates
                </button>
              </div>
              <p>{diagnosticsStatus || "Diagnostics include app version, platform, userData path, log path, and ssh/rsync availability."}</p>
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
      {onboardingOpen ? (
        <div className="preferences-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && void dismissOnboarding()}>
          <div className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div className="preferences-head">
              <strong id="onboarding-title">Before Your First Connection</strong>
              <button type="button" className="toolbar-button" onClick={() => void dismissOnboarding()}>
                Close
              </button>
            </div>
            <div className="onboarding-body">
              <p>SFTP browsing can use a password saved with macOS secure storage when available.</p>
              <p>Transfers use rsync over SSH BatchMode. Saved SFTP passwords are not passed to rsync, Terminal, commands, logs, or diagnostics.</p>
              <p>If secure storage is unavailable, password saving is disabled and profiles still save only non-secret connection fields.</p>
            </div>
            <div className="preferences-actions">
              <button type="button" className="toolbar-button is-active" onClick={() => void dismissOnboarding()}>
                Got it
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
                Show Inspector
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
                onClick={async () => {
                  await createLocalDirectory(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                New Folder
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  await createTextFile(contextMenu.tabId, "local");
                  setContextMenu(null);
                }}
              >
                New Text File
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
                  await openTerminalHere(contextMenu.tabId, "local", contextMenu.terminalPath);
                  setContextMenu(null);
                }}
              >
                Open Terminal Here
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
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await quickLookSelection(contextMenu.tabId, "remote");
                  setContextMenu(null);
                }}
              >
                Quick Look
                <span className="context-shortcut">Space</span>
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await editRemoteSelection(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                Edit
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
                onClick={async () => {
                  await createRemoteDirectory(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                New Folder
              </button>
              <button
                type="button"
                className="context-item"
                onClick={async () => {
                  await createTextFile(contextMenu.tabId, "remote");
                  setContextMenu(null);
                }}
              >
                New Text File
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
                Show Inspector
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
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await chmodRemoteSelection(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                Change Permissions
              </button>
              <button
                type="button"
                className="context-item"
                disabled={(tabs.find((t) => t.id === contextMenu.tabId)?.remotePane.selectedFullPaths.length ?? 0) !== 1}
                onClick={async () => {
                  await duplicateRemoteSelection(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                Duplicate File
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
                  await openTerminalHere(contextMenu.tabId, "remote", contextMenu.terminalPath);
                  setContextMenu(null);
                }}
              >
                Open SSH Terminal Here
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
      {createFolderDialog ? (
        <div
          className="delete-confirm-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !createFolderDialog.busy) setCreateFolderDialog(null);
          }}
        >
          <div className="delete-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="create-folder-title">
            <h3 id="create-folder-title">{createFolderDialog.kind === "folder" ? "New Folder" : "New Text File"}</h3>
            <p>
              Create a {createFolderDialog.kind === "folder" ? "folder" : "text file"} in{" "}
              {createFolderDialog.pane === "local" ? "local" : "remote"} current path.
            </p>
            <label className="create-folder-field">
              {createFolderDialog.kind === "folder" ? "Folder name" : "File name"}
              <input
                autoFocus
                value={createFolderDialog.name}
                disabled={createFolderDialog.busy}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setCreateFolderDialog((prev) => (prev ? { ...prev, name: event.target.value, error: "" } : prev))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitCreateFolderDialog();
                  } else if (event.key === "Escape" && !createFolderDialog.busy) {
                    event.preventDefault();
                    setCreateFolderDialog(null);
                  }
                }}
              />
            </label>
            {createFolderDialog.error ? <div className="error-banner">{createFolderDialog.error}</div> : null}
            <div className="delete-confirm-actions">
              <button type="button" className="toolbar-button" disabled={createFolderDialog.busy} onClick={() => setCreateFolderDialog(null)}>
                Cancel
              </button>
              <button type="button" className="toolbar-button is-active" disabled={createFolderDialog.busy} onClick={() => void submitCreateFolderDialog()}>
                {createFolderDialog.busy ? "Creating..." : "Create"}
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
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toPrecision(3)} ${units[index]}`;
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
    error: "",
    isListing: false
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

function rwxToOctal(input: string): string {
  if (!/^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/.test(input)) return "644";
  const chunks = [input.slice(0, 3), input.slice(3, 6), input.slice(6, 9)];
  return chunks
    .map((chunk) => {
      let value = 0;
      if (chunk[0] === "r") value += 4;
      if (chunk[1] === "w") value += 2;
      if (chunk[2] === "x") value += 1;
      return String(value);
    })
    .join("");
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

function buildV12FileColumns(settings: V12FileColumnSettings): V12FileColumn[] {
  return V12_DEFAULT_COLUMNS.map((column) => ({
    ...column,
    width: settings[column.key]?.width ?? column.width,
    visible: column.required ? true : settings[column.key]?.visible ?? column.visible
  }));
}

function createV12FileColumnSettings(pane: "local" | "remote"): V12FileColumnSettings {
  return Object.fromEntries(
    V12_DEFAULT_COLUMNS.map((column) => [
      column.key,
      {
        width: column.width,
        visible: column.required ? true : pane === "remote" && (column.key === "permissions" || column.key === "owner") ? true : column.visible
      }
    ])
  ) as V12FileColumnSettings;
}

function readV12FileColumnSettings(): V12PaneFileColumnSettings {
  const fallback: V12PaneFileColumnSettings = {
    local: createV12FileColumnSettings("local"),
    remote: createV12FileColumnSettings("remote")
  };
  try {
    const raw = window.localStorage.getItem(COFINDER_V12_COLUMNS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fallback;
    return {
      local: readV12PaneFileColumnSettings((parsed as Record<string, unknown>).local, "local"),
      remote: readV12PaneFileColumnSettings((parsed as Record<string, unknown>).remote, "remote")
    };
  } catch {
    return fallback;
  }
}

function readV12PaneFileColumnSettings(value: unknown, pane: "local" | "remote"): V12FileColumnSettings {
  const out = createV12FileColumnSettings(pane);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const column of V12_DEFAULT_COLUMNS) {
    const row = (value as Record<string, unknown>)[column.key];
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    out[column.key] = {
      width: typeof item.width === "number" && Number.isFinite(item.width) ? Math.max(60, Math.min(720, item.width)) : column.width,
      visible: column.required ? true : typeof item.visible === "boolean" ? item.visible : out[column.key].visible
    };
  }
  return out;
}

function writeJsonLocalStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Recent-path persistence is a convenience only; navigation must keep working if storage is unavailable.
  }
}
