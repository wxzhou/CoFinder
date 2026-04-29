import { useEffect, useMemo, useRef, useState } from "react";
import { TabBar } from "./components/TabBar";
import { SiteManagerModal } from "./components/SiteManagerModal";
import type { LocalErrorPayload, ProfileUpsertPayload, RemoteConnectRequest } from "../shared/types/ipc";
import type { LocalFileEntry, RemoteFileEntry, ServerProfile, SortDirection, SortKey, TransferStatus } from "../shared/types/models";

type HistoryState = {
  backStack: string[];
  forwardStack: string[];
};

type RemoteConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
type LocalPaneState = {
  currentPath: string;
  pathInput: string;
  entries: LocalFileEntry[];
  selectedPath: string | null;
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
  homePath: string;
  currentPath: string;
  pathInput: string;
  entries: RemoteFileEntry[];
  selectedPath: string | null;
  sortKey: SortKey;
  sortDirection: SortDirection;
  history: HistoryState;
  error: string;
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

const HOME_FALLBACK = "";
const AUTO_HIDE_DELAY_MS = 10_000;

type QueuePanelState = "hidden" | "expanded" | "collapsed" | "autoHidePending";
type MockTransferTask = {
  id: string;
  status: TransferStatus;
  direction: "upload" | "download";
  source: string;
  target: string;
};

const IS_DEV = import.meta.env.DEV;

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
  const [mockTasks, setMockTasks] = useState<MockTransferTask[]>([]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const localPane = activeTab.localPane;
  const remotePane = activeTab.remotePane;

  useEffect(() => {
    void navigateLocal(tabState.firstTabId, "", "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function navigateLocal(
    tabId: string,
    targetPath: string,
    mode: "push" | "replace" | "back" | "forward" = "push"
  ): Promise<void> {
    const previousPath = tabs.find((tab) => tab.id === tabId)?.localPane.currentPath ?? "";
    try {
      const response = await window.cofinder.local.listDirectory({ path: targetPath });
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab;
          const nextHistory = computeHistory(tab.localPane.history, mode, previousPath, response.path);
          return {
            ...tab,
            localPane: {
              ...tab.localPane,
              error: "",
              entries: response.entries,
              currentPath: response.path,
              pathInput: response.path,
              selectedPath: null,
              history: nextHistory
            }
          };
        })
      );
    } catch (error) {
      const localError = parseLocalError(error);
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id !== tabId
            ? tab
            : {
                ...tab,
                localPane: {
                  ...tab.localPane,
                  error: localError.message,
                  pathInput: previousPath
                }
              }
        )
      );
    }
  }

  const queueStats = useMemo(() => {
    const activeCount = mockTasks.filter((task) => task.status === "running").length;
    const queuedCount = mockTasks.filter((task) => task.status === "pending").length;
    const failedCount = mockTasks.filter((task) => task.status === "failed").length;
    const completedCount = mockTasks.filter((task) => task.status === "success" || task.status === "canceled").length;
    const allDone = mockTasks.length > 0 && activeCount === 0 && queuedCount === 0;
    return { activeCount, queuedCount, failedCount, completedCount, allDone };
  }, [mockTasks]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (mockTasks.length === 0) {
      setQueuePanelState("hidden");
      return;
    }

    if (queueStats.allDone && queueStats.failedCount === 0 && !queuePinned) {
      setQueuePanelState("autoHidePending");
      timer = setTimeout(() => {
        setQueuePanelState("hidden");
        setMockTasks([]);
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
  }, [mockTasks, queuePinned, queueStats.allDone, queueStats.failedCount]);

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

  const selectedEntries = localPane.selectedPath
    ? localPane.entries.filter((entry) => entry.fullPath === localPane.selectedPath)
    : [];
  const selectedSize = selectedEntries.reduce((acc, item) => acc + item.size, 0);
  const totalSize = localPane.entries.reduce((acc, item) => acc + item.size, 0);
  const remoteSelectedEntries = remotePane.selectedPath
    ? remotePane.entries.filter((entry) => entry.fullPath === remotePane.selectedPath)
    : [];
  const remoteSelectedSize = remoteSelectedEntries.reduce((acc, item) => acc + item.size, 0);
  const remoteTotalSize = remotePane.entries.reduce((acc, item) => acc + item.size, 0);

  async function handleRowDoubleClick(tabId: string, entry: LocalFileEntry): Promise<void> {
    if (entry.type === "directory") {
      await navigateLocal(tabId, entry.fullPath);
      return;
    }
    try {
      await window.cofinder.local.openPath({ path: entry.fullPath });
      setTabs((prev) =>
        prev.map((tab) => (tab.id === tabId ? { ...tab, localPane: { ...tab.localPane, error: "" } } : tab))
      );
    } catch (error) {
      const localError = parseLocalError(error);
      setTabs((prev) =>
        prev.map((tab) => (tab.id === tabId ? { ...tab, localPane: { ...tab.localPane, error: localError.message } } : tab))
      );
    }
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
    activeProfileId: string | null
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

    await finalizeRemoteConnection(tabId, connectionId, homePath, initialPath, titleLabel, profileId ?? null);
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
            selectedPath: null,
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
    void navigateLocal(id, "", "replace");
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
        void navigateLocal(newId, "", "replace");
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

  function seedMockTransfer(status: TransferStatus): void {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setMockTasks((prev) => [
      ...prev,
      {
        id,
        status,
        direction: status === "pending" ? "upload" : "download",
        source: "/Users/demo/source.txt",
        target: "/tmp/target.txt"
      }
    ]);
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
              onClick={() => void navigateLocal(activeTab.id, HOME_FALLBACK)}
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

          <div className="table-wrap">
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
                    className={localPane.selectedPath === entry.fullPath ? "row-selected" : ""}
                    onClick={() =>
                      setTabs((prev) =>
                        prev.map((tab) =>
                          tab.id === activeTab.id
                            ? { ...tab, localPane: { ...tab.localPane, selectedPath: entry.fullPath } }
                            : tab
                        )
                      )
                    }
                    onDoubleClick={() => void handleRowDoubleClick(activeTab.id, entry)}
                  >
                    <td className="name-cell" title={entry.name}>
                      <span className={`file-kind kind-${entry.type}`} aria-hidden="true">
                        {entry.type === "directory" ? "▸" : "·"}
                      </span>
                      <span className="name-text">{entry.name}</span>
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

              <div className="table-wrap">
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
                        className={remotePane.selectedPath === entry.fullPath ? "row-selected" : ""}
                        onClick={() =>
                          setTabs((prev) =>
                            prev.map((tab) =>
                              tab.id === activeTab.id
                                ? { ...tab, remotePane: { ...tab.remotePane, selectedPath: entry.fullPath } }
                                : tab
                            )
                          )
                        }
                        onDoubleClick={() => void handleRemoteDoubleClick(activeTab.id, entry)}
                      >
                        <td className="name-cell" title={entry.name}>
                          <span className={`file-kind kind-${entry.type}`} aria-hidden="true">
                            {entry.type === "directory" ? "▸" : "·"}
                          </span>
                          <span className="name-text">{entry.name}</span>
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
                      setMockTasks([]);
                      setQueuePanelState("hidden");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="queue-list">
                {mockTasks.length === 0 ? (
                  <div className="queue-empty">No transfer tasks.</div>
                ) : (
                  mockTasks.map((task) => (
                    <div key={task.id} className="queue-item">
                      <span>{task.direction}</span>
                      <span className={`queue-status status-${task.status}`}>{task.status}</span>
                      <span className="queue-path" title={`${task.source} -> ${task.target}`}>
                        {task.source} {"->"} {task.target}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {queuePanelState === "autoHidePending" ? (
                <div className="queue-footnote">All tasks completed. Auto-hiding in 10 seconds.</div>
              ) : null}
              {IS_DEV ? (
                <details className="queue-debug">
                  <summary>Debug transfer seeds</summary>
                  <div className="queue-debug-actions">
                    <button type="button" className="toolbar-button" onClick={() => seedMockTransfer("running")}>
                      +Running
                    </button>
                    <button type="button" className="toolbar-button" onClick={() => seedMockTransfer("pending")}>
                      +Queued
                    </button>
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => setMockTasks((prev) => prev.map((task) => ({ ...task, status: "success" })))}
                      disabled={mockTasks.length === 0}
                    >
                      Complete all
                    </button>
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() =>
                        setMockTasks((prev) =>
                          prev.length === 0 ? prev : [{ ...prev[0], status: "failed" }, ...prev.slice(1)]
                        )
                      }
                      disabled={mockTasks.length === 0}
                    >
                      Mark failed
                    </button>
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </section>
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

function parseLocalError(error: unknown): LocalErrorPayload {
  const rawMessage = error instanceof Error ? error.message : "Unknown local operation error";
  try {
    return JSON.parse(rawMessage) as LocalErrorPayload;
  } catch {
    const start = rawMessage.indexOf("{");
    const end = rawMessage.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(rawMessage.slice(start, end + 1)) as LocalErrorPayload;
      } catch {
        // no-op: fallback below
      }
    }
    return {
      code: "UNKNOWN",
      message: rawMessage
    };
  }
}


function sortMark(direction: SortDirection): string {
  return direction === "asc" ? "^" : "v";
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createLocalPaneState(): LocalPaneState {
  return {
    currentPath: "",
    pathInput: "",
    entries: [],
    selectedPath: null,
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
    homePath: "/",
    currentPath: "/",
    pathInput: "/",
    entries: [],
    selectedPath: null,
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
