import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings, PaneViewMode } from "../../shared/types/ipc";
import { writePrivateUtf8File } from "../security/privateAtomicWrite";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 2,
  general: {
    defaultLocalPath: "",
    restoreLastLocalPathOnLaunch: false,
    restoreLocalPathOnConnect: false,
    restoreRemotePathOnConnect: false,
    confirmBeforeDelete: true,
    showHiddenFiles: false,
    firstRunOnboardingDismissed: false,
    defaultTextEditor: "system"
  },
  transfer: {
    defaultConflictPolicy: "prompt",
    queueAutoHideDelayMs: 10_000,
    preserveTimestamps: true,
    deleteSourceAfterGzip: false,
    compressionConcurrency: 2
  },
  remote: {
    autoRefreshEnabled: false,
    autoRefreshIntervalSeconds: 60,
    autoReconnectAfterSleep: true
  },
  appearance: {
    rowDensity: "comfortable",
    defaultInspectorVisible: false,
    defaultPaneRatio: 0.5,
    sidebarVisible: true,
    sidebarWidth: 260,
    showListDisclosureControls: true,
    defaultLocalViewMode: "list",
    defaultRemoteViewMode: "list",
    groupLocalByType: false,
    groupRemoteByType: false
  }
};

export function defaultSettingsPath(userData: string): string {
  return path.join(userData, "settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function string(value: unknown, fallback: string, maxLength = 2048): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function viewMode(value: unknown, fallback: PaneViewMode): PaneViewMode {
  return value === "list" || value === "icon" || value === "column" || value === "gallery" ? value : fallback;
}

export function normalizeSettingsPatch(raw: unknown, base: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const root = isRecord(raw) ? raw : {};
  const general = isRecord(root.general) ? root.general : {};
  const transfer = isRecord(root.transfer) ? root.transfer : {};
  const remote = isRecord(root.remote) ? root.remote : {};
  const appearance = isRecord(root.appearance) ? root.appearance : {};
  const conflict = transfer.defaultConflictPolicy;
  const rowDensity = appearance.rowDensity;
  const legacyRestoreLastSession = typeof general.restoreLastSession === "boolean" ? general.restoreLastSession : undefined;
  return {
    schemaVersion: 2,
    general: {
      defaultLocalPath: string(general.defaultLocalPath, base.general.defaultLocalPath),
      restoreLastLocalPathOnLaunch: bool(
        general.restoreLastLocalPathOnLaunch,
        legacyRestoreLastSession ?? base.general.restoreLastLocalPathOnLaunch
      ),
      restoreLocalPathOnConnect: bool(
        general.restoreLocalPathOnConnect,
        legacyRestoreLastSession ?? base.general.restoreLocalPathOnConnect
      ),
      restoreRemotePathOnConnect: bool(
        general.restoreRemotePathOnConnect,
        legacyRestoreLastSession ?? base.general.restoreRemotePathOnConnect
      ),
      confirmBeforeDelete: bool(general.confirmBeforeDelete, base.general.confirmBeforeDelete),
      showHiddenFiles: bool(general.showHiddenFiles, base.general.showHiddenFiles),
      firstRunOnboardingDismissed: bool(general.firstRunOnboardingDismissed, base.general.firstRunOnboardingDismissed),
      defaultTextEditor: normalizeTextEditor(general.defaultTextEditor, base.general.defaultTextEditor)
    },
    transfer: {
      defaultConflictPolicy:
        conflict === "prompt" || conflict === "overwrite" || conflict === "skip" || conflict === "rename"
          ? conflict
          : base.transfer.defaultConflictPolicy,
      queueAutoHideDelayMs: numberInRange(transfer.queueAutoHideDelayMs, base.transfer.queueAutoHideDelayMs, 0, 60_000),
      preserveTimestamps: bool(transfer.preserveTimestamps, base.transfer.preserveTimestamps),
      deleteSourceAfterGzip: bool(transfer.deleteSourceAfterGzip, base.transfer.deleteSourceAfterGzip),
      compressionConcurrency: Math.round(numberInRange(transfer.compressionConcurrency, base.transfer.compressionConcurrency, 1, 4))
    },
    remote: {
      autoRefreshEnabled: bool(remote.autoRefreshEnabled, base.remote.autoRefreshEnabled),
      autoRefreshIntervalSeconds: Math.round(
        numberInRange(remote.autoRefreshIntervalSeconds, base.remote.autoRefreshIntervalSeconds, 5, 3600)
      ),
      autoReconnectAfterSleep: bool(remote.autoReconnectAfterSleep, base.remote.autoReconnectAfterSleep)
    },
    appearance: {
      rowDensity: rowDensity === "compact" || rowDensity === "comfortable" ? rowDensity : base.appearance.rowDensity,
      defaultInspectorVisible: bool(appearance.defaultInspectorVisible, base.appearance.defaultInspectorVisible),
      defaultPaneRatio: numberInRange(appearance.defaultPaneRatio, base.appearance.defaultPaneRatio, 0.25, 0.75),
      sidebarVisible: bool(appearance.sidebarVisible, base.appearance.sidebarVisible),
      sidebarWidth: numberInRange(appearance.sidebarWidth, base.appearance.sidebarWidth, 180, 420),
      showListDisclosureControls: bool(appearance.showListDisclosureControls, base.appearance.showListDisclosureControls),
      defaultLocalViewMode: viewMode(appearance.defaultLocalViewMode, base.appearance.defaultLocalViewMode),
      defaultRemoteViewMode: viewMode(appearance.defaultRemoteViewMode, base.appearance.defaultRemoteViewMode),
      groupLocalByType: bool(appearance.groupLocalByType, base.appearance.groupLocalByType),
      groupRemoteByType: bool(appearance.groupRemoteByType, base.appearance.groupRemoteByType)
    }
  };
}

function normalizeTextEditor(value: unknown, fallback: string): string {
  const text = string(value, fallback, 512);
  return text || "system";
}

function mergeSettings(base: AppSettings, patch: unknown): AppSettings {
  const p = isRecord(patch) ? patch : {};
  return normalizeSettingsPatch(
    {
      schemaVersion: 2,
      general: { ...base.general, ...(isRecord(p.general) ? p.general : {}) },
      transfer: { ...base.transfer, ...(isRecord(p.transfer) ? p.transfer : {}) },
      remote: { ...base.remote, ...(isRecord(p.remote) ? p.remote : {}) },
      appearance: { ...base.appearance, ...(isRecord(p.appearance) ? p.appearance : {}) }
    },
    base
  );
}

export class SettingsService {
  constructor(private readonly filePath: string) {}

  async get(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return normalizeSettingsPatch(JSON.parse(raw));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return DEFAULT_APP_SETTINGS;
      console.error("[SettingsService] Failed to read settings file.", { code });
      return DEFAULT_APP_SETTINGS;
    }
  }

  async set(patch: unknown): Promise<AppSettings> {
    const next = mergeSettings(await this.get(), patch);
    await writePrivateUtf8File(this.filePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
