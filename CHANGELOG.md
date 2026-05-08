# Changelog

## Versioning note

- This file is organized by **semver release version** once a version is **tagged/shipped**.
- **Product milestone** names appear in shipped section titles as phase context; see **README.md** for milestone ↔ release mapping.
- **Latest shipped release: v0.3.0.** The repo may temporarily use **`package.json` 0.4.0** during development so local **`npm run build` / `npm run dist`** does not overwrite the **v0.3.0** release identity—do **not** treat that as shipped until **v0.4.0** is tagged and this file gains a **`## v0.4.0`** section.

## Unreleased

**Target:** v0.4.0 / product milestone **V1.3** (draft notes—not shipped).

- Security/runtime hardening (on branch): Electron **37.x**, **0o600** writes for **`profiles.json`** / **`credentials.enc.json`**, IPC **`error.detail`** + **`logBoot`** redaction (`password`, `passphrase`, `privateKey`, `token`), transfer failure detail scrubbing (`docs/security.md`).
- V1.3 interaction efficiency: keyboard shortcut MVP, V12 pane splitter with persisted ratio, tab drag reorder, local favorites reorder, and per-profile remote favorites.
- Limited read-only remote preview cache: double-click or context menu **Open** for sniffed text/common images, local read-only cache with mutation checks, and cleanup on disconnect/tab close/quit.

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
