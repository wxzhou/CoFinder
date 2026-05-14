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
      general: { showHiddenFiles: true, defaultTextEditor: "TextMate" },
      transfer: { defaultConflictPolicy: "rename", queueAutoHideDelayMs: 2500 },
      appearance: { rowDensity: "compact", defaultPaneRatio: 0.7, sidebarWidth: 320 }
    });

    expect(saved.general.showHiddenFiles).toBe(true);
    expect(saved.general.defaultTextEditor).toBe("TextMate");
    expect(saved.transfer.defaultConflictPolicy).toBe("rename");
    expect(saved.transfer.queueAutoHideDelayMs).toBe(2500);
    expect(saved.appearance.rowDensity).toBe("compact");
    expect(saved.appearance.sidebarWidth).toBe(320);
    await expect(service.get()).resolves.toEqual(saved);
  });

  it("normalizes invalid values to safe defaults", () => {
    const settings = normalizeSettingsPatch({
      schemaVersion: 99,
      general: { confirmBeforeDelete: "no", defaultTextEditor: "" },
      transfer: { defaultConflictPolicy: "cancel", queueAutoHideDelayMs: -1 },
      appearance: { rowDensity: "huge", defaultPaneRatio: 1, sidebarWidth: 999 }
    });

    expect(settings.schemaVersion).toBe(2);
    expect(settings.general.confirmBeforeDelete).toBe(true);
    expect(settings.general.firstRunOnboardingDismissed).toBe(false);
    expect(settings.general.defaultTextEditor).toBe("system");
    expect(settings.transfer.defaultConflictPolicy).toBe("prompt");
    expect(settings.transfer.queueAutoHideDelayMs).toBe(0);
    expect(settings.appearance.rowDensity).toBe("comfortable");
    expect(settings.appearance.defaultPaneRatio).toBe(0.75);
    expect(settings.appearance.sidebarWidth).toBe(420);
  });

  it("migrates v1 settings into the v2 onboarding field", () => {
    const settings = normalizeSettingsPatch({
      schemaVersion: 1,
      general: { showHiddenFiles: true }
    });

    expect(settings.schemaVersion).toBe(2);
    expect(settings.general.showHiddenFiles).toBe(true);
    expect(settings.general.firstRunOnboardingDismissed).toBe(false);
  });
});
