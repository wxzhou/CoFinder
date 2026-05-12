import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../../shared/types/ipc";
import { writePrivateUtf8File } from "../security/privateAtomicWrite";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 2,
  general: {
    defaultLocalPath: "",
    restoreLastSession: false,
    confirmBeforeDelete: true,
    showHiddenFiles: false,
    firstRunOnboardingDismissed: false
  },
  transfer: {
    defaultConflictPolicy: "prompt",
    queueAutoHideDelayMs: 10_000,
    preserveTimestamps: true
  },
  appearance: {
    rowDensity: "comfortable",
    defaultInspectorVisible: false,
    defaultPaneRatio: 0.5,
    sidebarVisible: true
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

export function normalizeSettingsPatch(raw: unknown, base: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const root = isRecord(raw) ? raw : {};
  const general = isRecord(root.general) ? root.general : {};
  const transfer = isRecord(root.transfer) ? root.transfer : {};
  const appearance = isRecord(root.appearance) ? root.appearance : {};
  const conflict = transfer.defaultConflictPolicy;
  const rowDensity = appearance.rowDensity;
  return {
    schemaVersion: 2,
    general: {
      defaultLocalPath: string(general.defaultLocalPath, base.general.defaultLocalPath),
      restoreLastSession: bool(general.restoreLastSession, base.general.restoreLastSession),
      confirmBeforeDelete: bool(general.confirmBeforeDelete, base.general.confirmBeforeDelete),
      showHiddenFiles: bool(general.showHiddenFiles, base.general.showHiddenFiles),
      firstRunOnboardingDismissed: bool(general.firstRunOnboardingDismissed, base.general.firstRunOnboardingDismissed)
    },
    transfer: {
      defaultConflictPolicy:
        conflict === "prompt" || conflict === "overwrite" || conflict === "skip" || conflict === "rename"
          ? conflict
          : base.transfer.defaultConflictPolicy,
      queueAutoHideDelayMs: numberInRange(transfer.queueAutoHideDelayMs, base.transfer.queueAutoHideDelayMs, 0, 60_000),
      preserveTimestamps: bool(transfer.preserveTimestamps, base.transfer.preserveTimestamps)
    },
    appearance: {
      rowDensity: rowDensity === "compact" || rowDensity === "comfortable" ? rowDensity : base.appearance.rowDensity,
      defaultInspectorVisible: bool(appearance.defaultInspectorVisible, base.appearance.defaultInspectorVisible),
      defaultPaneRatio: numberInRange(appearance.defaultPaneRatio, base.appearance.defaultPaneRatio, 0.25, 0.75),
      sidebarVisible: bool(appearance.sidebarVisible, base.appearance.sidebarVisible)
    }
  };
}

function mergeSettings(base: AppSettings, patch: unknown): AppSettings {
  const p = isRecord(patch) ? patch : {};
  return normalizeSettingsPatch(
    {
      schemaVersion: 2,
      general: { ...base.general, ...(isRecord(p.general) ? p.general : {}) },
      transfer: { ...base.transfer, ...(isRecord(p.transfer) ? p.transfer : {}) },
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
