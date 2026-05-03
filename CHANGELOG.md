# Changelog

## 0.3.0

- V1.2 Finder shell (M1–M6) behind `?ui=v12` / `COFINDER_UI_V12=1`: dual-pane browsing, per-pane inspector, embedded remote connect, wired toolbar and transfer drawer.
- M6: v12-only UI polish under `.cfv12-root`; **default UI Option B** (classic remains default); docs and smoke/release checklists updated; `npm run package` verified.

## 0.2.0

- Complete V1.1 milestones M1-M6.
- Add local/remote rename, delete, and Get Info workflows.
- Add Quick Look MVP (local file preview + remote fallback messaging).
- Improve selection behavior and UI polish with regression hardening.
- Finalize V1.1 docs, smoke checklist, and release checklist.

## 0.1.0

- Ship CoFinder V1 baseline for macOS dual-pane workflow.
- Implement local file browsing (navigation, sorting, status bar, open/reveal).
- Implement SFTP remote browsing with connect/disconnect and multi-tab isolation.
- Implement Site Manager (profile CRUD/login) with optional `safeStorage` password save.
- Implement rsync upload/download serial transfer queue with queue controls.
- Implement multi-selection (`Cmd`/`Shift` click + `Cmd/Ctrl+A`) and basic local/remote context menus.
- Complete V1 hardening/packaging/docs (`electron-builder` dmg+zip, release/security/smoke docs).
- Not supported in V1: remote edit auto-sync, remote Quick Look, drag selection, drag-drop upload/download, full Preferences UI, full i18n.
