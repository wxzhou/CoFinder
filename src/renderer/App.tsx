import { useEffect, useMemo, useRef, useState } from "react";
import { TabBar } from "./components/TabBar";
import { SiteManagerModal } from "./components/SiteManagerModal";
import { applyRowSelection, normalizeContextSelection, selectAllRows, stringifySelection } from "./selection";
import type {
  EnqueueDownloadRequest,
  EnqueueUploadRequest,
  ProfileUpsertPayload,
  RemoteConnectRequest,
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

type ActivePane = "local" | "remote";

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
const INLINE_RENAME_CLICK_MIN_MS = 350;
const INLINE_RENAME_CLICK_MAX_MS = 1500;

type QueuePanelState = "hidden" | "expanded" | "collapsed" | "autoHidePending";
type PlainClickRecord = {
  pane: "local" | "remote";
  tabId: string;
  path: string;
  at: number;
};

export function App() {
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
  const siteManagerRef = useRef(siteManagerByTab);
  useEffect(() => {
    siteManagerRef.current = siteManagerByTab;
  }, [siteManagerByTab]);
  const [queuePanelState, setQueuePanelState] = useState<QueuePanelState>("hidden");
  const [queuePinned, setQueuePinned] = useState<boolean>(false);
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const [queueError, setQueueError] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineRename, setInlineRename] = useState<InlineRenameState | null>(null);
  const lastPlainClickRef = useRef<PlainClickRecord | null>(null);
  const [activePane, setActivePane] = useState<ActivePane>("local");
  const [localHomePath, setLocalHomePath] = useState<string>("");

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const localPane = activeTab.localPane;
  const remotePane = activeTab.remotePane;

  useEffect(() => {
    void initializeLocalHome(tabState.firstTabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function initializeLocalHome(tabId: string): Promise<void> {
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
    await navigateLocal(tabId, homePath, "replace");
  }


  useEffect(() => {
    const off = window.cofinder.transfer.onUpdate((payload: TransferUpdatePayload) => {
      setTransferTasks(payload.tasks);
    });
    void loadTransferTasks();
    return off;
  }, []);

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
      if (!isSelectAll) return;
      if (contextMenu) return;
      if (isEditableTarget(document.activeElement)) return;

      if (activePane === "local") {
        const selectedState = selectAllRows(localPane.entries, "first");
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === activeTab.id ? { ...tab, localPane: { ...tab.localPane, ...selectedState } } : tab
          )
        );
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
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePane, contextMenu, localPane.entries, remotePane.entries, activeTab.id, setTabs]);

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
      }, AUTO_HIDE_DELAY_MS);
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
  }, [transferTasks, queuePinned, queueStats.allDone, queueStats.failedCount]);

  const sortedEntries = useMemo(() => {
    const copied = [...localPane.entries];
    copied.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;

      let value = 0;
      if (localPane.sortKey === "name") value = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (localPane.sortKey === "size") value = a.size - b.size;
      if (localPane.sortKey === "mtime") value = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      return localPane.sortDirection === "asc" ? value : -value;
    });
    return copied;
  }, [localPane.entries, localPane.sortDirection, localPane.sortKey]);

  const sortedRemoteEntries = useMemo(() => {
    const copied = [...remotePane.entries];
    copied.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      let value = 0;
      if (remotePane.sortKey === "name") value = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (remotePane.sortKey === "size") value = a.size - b.size;
      if (remotePane.sortKey === "mtime") value = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      return remotePane.sortDirection === "asc" ? value : -value;
    });
    return copied;
  }, [remotePane.entries, remotePane.sortDirection, remotePane.sortKey]);

  const selectedEntries = localPane.entries.filter((entry) => localPane.selectedFullPaths.includes(entry.fullPath));
  const selectedSize = selectedEntries.reduce((acc, item) => acc + item.size, 0);
  const totalSize = localPane.entries.reduce((acc, item) => acc + item.size, 0);
  const remoteSelectedEntries = remotePane.entries.filter((entry) => remotePane.selectedFullPaths.includes(entry.fullPath));
  const remoteSelectedSize = remoteSelectedEntries.reduce((acc, item) => acc + item.size, 0);
  const remoteTotalSize = remotePane.entries.reduce((acc, item) => acc + item.size, 0);

  async function handleRowDoubleClick(tabId: string, entry: LocalFileEntry): Promise<void> {
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

  function closeSiteManagerForTab(tabId: string): void {
    setSiteManagerByTab((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
  }

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

  async function handleSiteManagerLogin(tabId: string): Promise<void> {
    const sm = siteManagerRef.current[tabId];
    if (!sm?.open) return;
    const { draft, profiles } = sm;
    const host = draft.host.trim();
    const username = draft.username.trim();
    const port = draft.port;
    const pwd = (draft.password ?? "").trim();
    const hasStored = draft.id ? profiles.some((p) => p.id === draft.id && p.hasSavedPassword) : false;

    if (draft.authType === "privateKey") {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...sm, modalError: "Private key authentication is not supported yet." }
      }));
      return;
    }
    if (!host) {
      setSiteManagerByTab((prev) => ({ ...prev, [tabId]: { ...sm, modalError: "Host is required." } }));
      return;
    }
    if (!username) {
      setSiteManagerByTab((prev) => ({ ...prev, [tabId]: { ...sm, modalError: "Username is required." } }));
      return;
    }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...sm, modalError: "Port must be between 1 and 65535." }
      }));
      return;
    }
    if (!pwd && !hasStored) {
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: { ...sm, modalError: "Password is required, or choose a site with a saved password." }
      }));
      return;
    }

    setSiteManagerByTab((prev) => ({
      ...prev,
      [tabId]: { ...sm, busy: "login", modalError: "" }
    }));

    let profileId = draft.id;
    let connectPassword: string | undefined = pwd || undefined;

    if (draft.savePassword && pwd) {
      const saveRes = await window.cofinder.profiles.save({
        ...draft,
        host,
        username,
        port,
        password: pwd,
        savePassword: true,
        defaultRemotePath: draft.defaultRemotePath?.trim() || undefined
      });
      if (!saveRes.ok) {
        setSiteManagerByTab((prev) => ({
          ...prev,
          [tabId]: { ...(prev[tabId] ?? sm), busy: "idle", modalError: saveRes.error.message }
        }));
        return;
      }
      profileId = saveRes.data.id;
      connectPassword = undefined;
      void refreshSiteManagerForTab(tabId);
    }

    const defaultPath = draft.defaultRemotePath?.trim() || undefined;

    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId
          ? { ...item, remotePane: { ...item.remotePane, connectionStatus: "connecting", error: "" } }
          : item
      )
    );

    const connectPayload: RemoteConnectRequest = {
      profileId: profileId || undefined,
      host,
      port,
      username,
      password: connectPassword,
      defaultRemotePath: defaultPath,
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
      setSiteManagerByTab((prev) => ({
        ...prev,
        [tabId]: {
          ...(prev[tabId] ?? sm),
          busy: "idle",
          modalError: connectResult.error.message
        }
      }));
      return;
    }

    const { connectionId, homePath } = connectResult.data;
    const titleLabel = draft.alias.trim() || `${username}@${host}:${port}`;
    const initialPath = defaultPath || homePath || "/";

    closeSiteManagerForTab(tabId);

    await finalizeRemoteConnection(tabId, connectionId, homePath, initialPath, titleLabel, profileId ?? null, {
      host,
      port,
      username,
      authType: "password"
    });
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
    return true;
  }

  async function handleRemoteDoubleClick(tabId: string, entry: RemoteFileEntry): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (entry.type === "directory") {
      if (tab.remotePane.connectionId) await listRemotePath(tab.remotePane.connectionId, entry.fullPath, "push", tabId);
      return;
    }
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId
          ? { ...item, remotePane: { ...item.remotePane, error: "Remote file open/edit will be implemented later." } }
          : item
      )
    );
  }

  async function enqueueUpload(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const selected = tab.localPane.selectedFullPaths;
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
      remoteDestinationDir: tab.remotePane.currentPath
    };
    const result = await window.cofinder.transfer.enqueueUpload(payload);
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

  async function enqueueDownload(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;
    const selected = tab.remotePane.selectedFullPaths;
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
      localDestinationDir: tab.localPane.currentPath
    };
    const result = await window.cofinder.transfer.enqueueDownload(payload);
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

  function handleLocalRowClick(tabId: string, entry: LocalFileEntry, event: { metaKey: boolean; shiftKey: boolean }): void {
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
  }

  function handleRemoteRowClick(tabId: string, entry: RemoteFileEntry, event: { metaKey: boolean; shiftKey: boolean }): void {
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

  async function disconnectRemote(tabId: string): Promise<void> {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.remotePane.connectionId) return;
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

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="title-group">
          <strong>CoFinder</strong>
        </div>
      </header>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onAdd={createTab}
        onClose={(tabId) => void closeTab(tabId)}
      />
      <main className="pane-layout">
        <section className="pane local-pane">
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

          <form
            className="path-form"
            onSubmit={(event) => {
              event.preventDefault();
              void navigateLocal(activeTab.id, localPane.pathInput);
            }}
          >
            <input
              value={localPane.pathInput}
              onChange={(event) =>
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === activeTab.id
                      ? { ...tab, localPane: { ...tab.localPane, pathInput: event.target.value } }
                      : tab
                  )
                )
              }
              aria-label="Local path"
            />
          </form>

          {localPane.error ? <div className="error-banner">{localPane.error}</div> : null}

          <div
            className="table-wrap"
            onMouseDown={() => {
              setActivePane("local");
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
                    className={localPane.selectedFullPaths.includes(entry.fullPath) ? "row-selected" : ""}
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
                      handleLocalRowClick(activeTab.id, entry, { metaKey: event.metaKey, shiftKey: event.shiftKey });
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
            <span>Total: {localPane.entries.length}</span>
            <span>Selected Size: {formatSize(selectedSize)}</span>
            <span>Total Size: {formatSize(totalSize)}</span>
          </div>
        </section>
        <section className="splitter" />
        <section className="pane remote-pane">
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

              <form
                className="path-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void listRemotePath(remotePane.connectionId!, remotePane.pathInput, "push", activeTab.id);
                }}
              >
                <input
                  value={remotePane.pathInput}
                  onChange={(event) =>
                    setTabs((prev) =>
                      prev.map((tab) =>
                        tab.id === activeTab.id
                          ? { ...tab, remotePane: { ...tab.remotePane, pathInput: event.target.value } }
                          : tab
                      )
                    )
                  }
                  aria-label="Remote path"
                />
              </form>

              {remotePane.error ? <div className="error-banner">{remotePane.error}</div> : null}

              <div
                className="table-wrap"
                onMouseDown={() => {
                  setActivePane("remote");
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
                        className={remotePane.selectedFullPaths.includes(entry.fullPath) ? "row-selected" : ""}
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
                          handleRemoteRowClick(activeTab.id, entry, { metaKey: event.metaKey, shiftKey: event.shiftKey });
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
                <span>Total: {remotePane.entries.length}</span>
                <span>Selected Size: {formatSize(remoteSelectedSize)}</span>
                <span>Total Size: {formatSize(remoteTotalSize)}</span>
              </div>
            </>
          ) : null}
        </section>
      </main>

      {queuePanelState !== "hidden" ? (
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
            <div className="queue-panel">
              <div className="queue-header">
                <div>
                  <strong>Transfer Queue</strong>
                  <span className="queue-summary">{summarizeQueue()}</span>
                </div>
                <div className="queue-controls">
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
                      </span>
                    </div>
                  ))
                )}
              </div>
              {queuePanelState === "autoHidePending" ? (
                <div className="queue-footnote">All tasks completed. Auto-hiding in 10 seconds.</div>
              ) : null}
            </div>
          )}
        </section>
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
              </button>
            </>
          ) : (
            <>
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
              </button>
            </>
          )}
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

function createLocalPaneState(): LocalPaneState {
  return {
    currentPath: "",
    pathInput: "",
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
