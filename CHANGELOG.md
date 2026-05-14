# Changelog

## Versioning note

- This file is organized by **semver release version** once a version is **tagged/shipped**.
- **Product milestone** names appear in shipped section titles as phase context; see **README.md** for milestone ↔ release mapping.
- **Latest shipped release: v1.3.0.** Intermediate development milestones **V1.5-V1.9** were not published as standalone semver tags; their work shipped together in **v1.0.0 / V2.0**.

## Unreleased

No user-facing changes since **v1.3.0**.

## v1.3.0 — Product milestone V2.3

V2.3 is a navigation and preference polish release driven by v1.2.0 hands-on feedback.

- Preferences now uses an explicit text-editor selector with System default, TextEdit, TextMate, and Custom options.
- `Cmd+Option+C` now detects the physical C key, making Copy Current Path reliable on macOS while preserving `Cmd+Shift+C` for selected paths.
- V12 panes no longer show a separate full path address field beside breadcrumbs.
- Breadcrumbs switch to full path entry via empty breadcrumb click, breadcrumb double-click, or `Cmd+L`; Enter navigates and Escape/blur returns to breadcrumb mode.
- Breadcrumb chrome includes a Copy Path icon button while Filter names, Recent, History, and Clear Recent remain in the navigation row.

## v1.2.0 — Product milestone V2.2

V2.2 is a corrective release driven by v1.1.0 hands-on feedback.

- Delete confirmations now close immediately after confirmation, duplicate delete submissions are guarded, and local/remote panes show a busy banner while delete work is running.
- New Folder uses an in-app dialog for both local and remote panes, avoiding unreliable hidden system prompts and surfacing validation/service errors.
- Preferences now includes a default text editor setting for remote text preview, with system default, TextEdit, TextMate, or custom app/path support and a safe fallback.
- Ordinary row single-click no longer reveals Inspector or squeezes the file list; Inspector remains available through the toolbar, context menu, and `Cmd+I`.
- Copy Current Path exposes the `Cmd+Option+C` shortcut in the toolbar tooltip and Preferences shortcut reference.
- Open Terminal Here / Open SSH Terminal Here now works from pane background context menus. Row context menus open inside folders or in a file's parent folder.
- SSH terminal launch now quotes remote paths robustly and opens a non-login interactive shell after `cd`, so remote startup files do not override the requested directory.

## v1.1.0 — Product milestone V2.1

V2.1 is a stabilization release driven by v1.0.0 hands-on feedback.

- Transfers start promptly by removing the extra SSH preflight delay while keeping rsync BatchMode safeguards.
- Folder uploads now target the selected remote directory once, avoiding duplicated `/folder/folder` nesting.
- Unicode local and remote transfer paths, including Chinese characters, are accepted while shell-dangerous/control characters remain blocked.
- Remote folder deletion handles SFTP directory stat variants correctly.
- Local and remote New Folder actions are pane-aware, return visible errors, and the app adds New Text File for both panes with unique default names.
- Remote preview text sniffing now handles `.bed`, tab-delimited text, and UTF-8 content by content rather than extension; text previews open with the macOS text editor path.
- Inspector is the single info surface: the old Get Info modal is removed, core metadata moved into Inspector, and directory child file/folder counts are shown.
- Selecting a row no longer auto-opens Inspector and squeezes the file list; explicit Inspector toggle or `Cmd+I` reveals it.
- Navigation polish adds active-pane Home, Copy Current Path, `Cmd+Option+C`, stronger active-pane styling, and per-profile remote last-path restore when restore-last-session is enabled.
- macOS application menu now exposes Preferences, and the V12 sidebar can be resized with persisted width.

## v1.0.0 — Product milestone V2.0

Includes development milestones **V1.5-V1.9**. There are no standalone `v0.6.0`, `v0.7.0`, `v0.8.0`, `v0.9.0`, or `v0.10.0` release tags.

- Stable personal release: documentation, release checklist, smoke checklist, IPC inventory, and security notes are aligned with the implemented feature set.
- V2.0 scope cuts are explicit: full auto-update install, remote edit auto-sync, App Store distribution, cross-platform ports, and plugin ecosystem remain out of scope.
- Release notes call out unsigned local artifacts, manual GitHub Releases update policy, diagnostics redaction, and full smoke execution expectations.

**V1.9 reliability work included in v1.0.0:**

- Packaging/reliability: release checklist now covers version bump, changelog, git tag, dmg/zip, smoke, and GitHub Release artifact steps.
- Diagnostics UI: Preferences can open the log folder/file and copy a redacted diagnostics bundle with app version, platform, userData/log paths, and ssh/rsync availability.
- First-run onboarding explains SFTP password saving, rsync BatchMode SSH transfer requirements, and safeStorage availability.
- Update policy: in-app Check for Updates reports the current manual GitHub Releases policy; silent install remains deferred until signing/notarization prerequisites are met.
- Settings schema migrated to v2 with a persisted onboarding-dismissed flag.

**V1.8 remote operations included in v1.0.0:**

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
