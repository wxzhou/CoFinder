# Changelog

## Versioning note

- This file is organized by **semver release version** once a version is **tagged/shipped**.
- **Product milestone** names appear in shipped section titles as phase context; see **README.md** for milestone ↔ release mapping.
- **Latest shipped release: v0.5.0.** The repo may temporarily use a newer **`package.json`** version during development so local **`npm run build` / `npm run dist`** can exercise the next artifact identity. Do **not** treat development-tree versions as shipped until matching git tags and release sections exist.

## Unreleased

**Target:** v0.9.0 / product milestone **V1.8** (draft notes—not shipped). V1.5-v1.7 development-tree milestones remain unshipped until tagged.

- Remote operations expansion: mkdir, basic chmod, file duplicate, local Terminal here, and remote SSH Terminal here.
- Remote directory size now uses an async cancelable job with traversal caps instead of blocking recursive UI work.
- Remote symlink entries are surfaced as symlink where SFTP exposes that type.
- Security caveat documented: SSH terminal launch never places saved passwords on command lines.
- Remote operation tests cover mkdir, chmod, duplicate, and capped directory-size traversal.

- Current-directory quick filter for local and remote panes, including the V12 toolbar search box for the focused pane.
- Path autocomplete uses known locations only: local favorites/recents/history and remote current-tab/per-profile recents/favorites/history. It does not perform indexed search or background SFTP crawling.
- Recent locations: local recent paths and per-profile remote recent paths, each with a clear action.
- History UI: per-pane Back/Forward history dropdowns supplement existing toolbar buttons while preserving tab-local history state.
- Navigation helper tests cover deterministic filtering, recent-path de-duplication, and prefix suggestions.

- Preferences MVP: versioned `settings.json` managed by main-process `SettingsService` through `settings:get` / `settings:set`.
- General preferences: default local path, delete confirmation toggle, hidden file visibility, and restore-last-local-path behavior.
- Transfer preferences: default conflict policy, queue auto-hide delay, and timestamp preservation toggle wired to rsync flags.
- Appearance preferences: row density, default inspector visibility, default pane ratio, and sidebar visibility.
- Shortcut reference is visible from Preferences.

- Drag-and-drop transfer: drag selected local items to the remote pane to upload, and selected remote items to the local pane to download.
- Finder-to-remote upload: drag files/folders from Finder into the remote pane.
- Drop target feedback: current-pane drops target the current directory, directory-row drops target that directory, invalid row drops show forbidden feedback.
- Marquee selection: drag from pane background to select rows, with additive selection via `Cmd`/`Shift`.

## v0.5.0 — Product milestone V1.4

- Transfer conflict handling: upload/download checks detect existing local or remote targets before enqueue and support overwrite, skip, rename/keep-both, and cancel choices.
- Transfer queue recovery: failed tasks can be retried individually or as a group while preserving original transfer metadata.
- Transfer error taxonomy: failed tasks now carry stable categories for rsync missing, SSH BatchMode failure, permission denied, path not found, no space left, remote disconnect, and unknown errors; failed queue rows can copy diagnostic details.
- Queue safety: transfer queue startup is serialized across preflight/retry paths so retry-all cannot start multiple tasks concurrently.

## v0.4.0 — Product milestone V1.3

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
