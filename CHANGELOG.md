# Changelog

## Versioning note

- This file is organized by **semver release version** (e.g. **v0.3.0**).
- **Product milestone** names (V1, V1.1, V1.2, …) appear in section titles only as phase context; see **README.md** for the full milestone ↔ release mapping.
- Shipped today: **V1.2** ↔ **v0.3.0**. Next planned phase: **V1.3** targeting **v0.4.0**.

## v0.3.0 — Product milestone V1.2

- V1.2 Finder shell (M1–M6): dual-pane browsing, per-pane inspector, embedded remote connect, wired toolbar and transfer drawer — **default UI** in dev and packaged builds; legacy classic via `?ui=v11` / `COFINDER_LEGACY_UI=1` / `VITE_COFINDER_LEGACY_UI=1`.
- M6: v12-only UI polish under `.cfv12-root`; docs and smoke/release checklists updated; `npm run package` verified.

## v0.2.0 — Product milestone V1.1

- Complete V1.1 milestones M1-M6.
- Add local/remote rename, delete, and Get Info workflows.
- Add Quick Look MVP (local file preview + remote fallback messaging).
- Improve selection behavior and UI polish with regression hardening.
- Finalize V1.1 docs, smoke checklist, and release checklist.

## v0.1.0 — Product milestone V1

- Ship CoFinder V1 baseline for macOS dual-pane workflow.
- Implement local file browsing (navigation, sorting, status bar, open/reveal).
- Implement SFTP remote browsing with connect/disconnect and multi-tab isolation.
- Implement Site Manager (profile CRUD/login) with optional `safeStorage` password save.
- Implement rsync upload/download serial transfer queue with queue controls.
- Implement multi-selection (`Cmd`/`Shift` click + `Cmd/Ctrl+A`) and basic local/remote context menus.
- Complete V1 hardening/packaging/docs (`electron-builder` dmg+zip, release/security/smoke docs).
- Not supported in V1: remote edit auto-sync, remote Quick Look, drag selection, drag-drop upload/download, full Preferences UI, full i18n.
