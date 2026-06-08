import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, SettingsService, normalizeSettingsPatch } from "../src/main/services/SettingsService";

describe("SettingsService", () => {
  it("returns defaults when settings file is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-settings-test-"));
    const service = new SettingsService(path.join(dir, "settings.json"));
    await expect(service.get()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });

  it("merges and persists validated settings patches", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cofinder-settings-test-"));
    const file = path.join(dir, "settings.json");
    const service = new SettingsService(file);

    const saved = await service.set({
      general: {
        showHiddenFiles: true,
        defaultTextEditor: "TextMate",
        restoreLastLocalPathOnLaunch: true,
        restoreLocalPathOnConnect: true,
        restoreRemotePathOnConnect: true
      },
      transfer: { defaultConflictPolicy: "rename", queueAutoHideDelayMs: 2500, compressionConcurrency: 3 },
      remote: { autoRefreshEnabled: true, autoRefreshIntervalSeconds: 30, autoReconnectAfterSleep: false },
      appearance: { rowDensity: "compact", defaultPaneRatio: 0.7, sidebarWidth: 320, defaultLocalViewMode: "icon", defaultRemoteViewMode: "icon" }
    });

    expect(saved.general.showHiddenFiles).toBe(true);
    expect(saved.general.defaultTextEditor).toBe("TextMate");
    expect(saved.general.restoreLastLocalPathOnLaunch).toBe(true);
    expect(saved.general.restoreLocalPathOnConnect).toBe(true);
    expect(saved.general.restoreRemotePathOnConnect).toBe(true);
    expect(saved.transfer.defaultConflictPolicy).toBe("rename");
    expect(saved.transfer.queueAutoHideDelayMs).toBe(2500);
    expect(saved.transfer.compressionConcurrency).toBe(3);
    expect(saved.remote.autoRefreshEnabled).toBe(true);
    expect(saved.remote.autoRefreshIntervalSeconds).toBe(30);
    expect(saved.remote.autoReconnectAfterSleep).toBe(false);
    expect(saved.appearance.rowDensity).toBe("compact");
    expect(saved.appearance.sidebarWidth).toBe(320);
    expect(saved.appearance.defaultLocalViewMode).toBe("icon");
    expect(saved.appearance.defaultRemoteViewMode).toBe("icon");
    await expect(service.get()).resolves.toEqual(saved);
  });

  it("normalizes invalid values to safe defaults", () => {
    const settings = normalizeSettingsPatch({
      schemaVersion: 99,
      general: {
        confirmBeforeDelete: "no",
        defaultTextEditor: "",
        restoreLastLocalPathOnLaunch: "yes",
        restoreLocalPathOnConnect: "yes",
        restoreRemotePathOnConnect: "yes"
      },
      transfer: { defaultConflictPolicy: "cancel", queueAutoHideDelayMs: -1, compressionConcurrency: 99 },
      remote: { autoRefreshEnabled: "yes", autoRefreshIntervalSeconds: 1, autoReconnectAfterSleep: "no" },
      appearance: { rowDensity: "huge", defaultPaneRatio: 1, sidebarWidth: 999, defaultLocalViewMode: "coverflow", defaultRemoteViewMode: 42 }
    });

    expect(settings.schemaVersion).toBe(2);
    expect(settings.general.confirmBeforeDelete).toBe(true);
    expect(settings.general.firstRunOnboardingDismissed).toBe(false);
    expect(settings.general.defaultTextEditor).toBe("system");
    expect(settings.general.restoreLastLocalPathOnLaunch).toBe(false);
    expect(settings.general.restoreLocalPathOnConnect).toBe(false);
    expect(settings.general.restoreRemotePathOnConnect).toBe(false);
    expect(settings.transfer.defaultConflictPolicy).toBe("prompt");
    expect(settings.transfer.queueAutoHideDelayMs).toBe(0);
    expect(settings.transfer.compressionConcurrency).toBe(4);
    expect(settings.remote.autoRefreshEnabled).toBe(false);
    expect(settings.remote.autoRefreshIntervalSeconds).toBe(5);
    expect(settings.remote.autoReconnectAfterSleep).toBe(true);
    expect(settings.appearance.rowDensity).toBe("comfortable");
    expect(settings.appearance.defaultPaneRatio).toBe(0.75);
    expect(settings.appearance.sidebarWidth).toBe(420);
    expect(settings.appearance.defaultLocalViewMode).toBe("list");
    expect(settings.appearance.defaultRemoteViewMode).toBe("list");
  });

  it("migrates v1 settings into the v2 onboarding field", () => {
    const settings = normalizeSettingsPatch({
      schemaVersion: 1,
      general: { showHiddenFiles: true, restoreLastSession: true }
    });

    expect(settings.schemaVersion).toBe(2);
    expect(settings.general.showHiddenFiles).toBe(true);
    expect(settings.general.firstRunOnboardingDismissed).toBe(false);
    expect(settings.general.restoreLastLocalPathOnLaunch).toBe(true);
    expect(settings.general.restoreLocalPathOnConnect).toBe(true);
    expect(settings.general.restoreRemotePathOnConnect).toBe(true);
  });
});
