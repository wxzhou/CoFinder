# Changelog

## Versioning note

- This file is organized by **semver release version** once a version is **tagged/shipped**.
- **Product milestone** names appear in shipped section titles as phase context; see **README.md** for milestone ↔ release mapping.
- **Latest release: v1.9.0.** Intermediate development milestones **V1.5-V1.9** were not published as standalone semver tags; their work shipped together in **v1.0.0 / V2.0**.

## Unreleased / v1.9.2 development

- Added the first multi-lane Jobs scheduler: upload/download remain in a serial transfer lane, delete remains in a serial delete lane, and compression-style jobs can run in their own lane.
- Added path locks so unsafe parent/child or same-destination jobs remain pending instead of starting beside a conflicting running job.
- Added a Jobs preference for compression job concurrency, defaulting to `2` and clamped to `1-4`.
- Added explicit Jobs pane queue filters for all queues, transfer, compression, and delete, combinable with the existing status filters.
- Adjusted V12 contiguous file-selection highlights to use Finder-like rounded outer corners.
- Added focused unit coverage for transfer-vs-compression concurrency, serial transfer behavior, path locks, and compression-concurrency setting validation.
- Polished V12 multi-selection rows so selected ranges use continuous row-width highlights with thin separators, and inactive-pane selections no longer show a darker left crescent.

## v1.9.1 planning

- Planning-only development branch for the v1.9.x hard-feature track. No runtime behavior is changed yet.
- Added detailed plans for multi-lane Jobs, remote copy/move, grep/less content tools, expandable list rows, and additional Finder-style view modes.
- v1.9.x development checkpoints are recorded in this changelog instead of a separate release-log file.

## v1.9.0 — Stability rollup after v1.8.0

This release publishes the stabilization and polish work completed after `v1.8.0`, including the V2.8.1-V2.8.9 patch line and the final file-operation fixes.

- Remote `Open` now uses the same writable local-copy session model as remote `Edit`, opening files with the default macOS app and uploading saved changes back after conflict checks.
- Remote `Edit` continues to use the configured text editor, but can now force-open binary-looking files after explicit confirmation.
- Remote `Open` routes source and script files such as `.sh`, `.py`, `.R`, `.m`, and `.cpp` to the configured text editor, even when executable, instead of warning or handing them to a default app that might run them.
- Remote `Change Permissions` now uses an in-app User/Group/Other permission checkbox dialog with a synchronized octal-mode field instead of relying on `window.prompt`.
- Local and remote context menus now group selected-item file utilities under `File Operation`.
- Added local and remote `Touch` and `Change Timestamp` actions for selected files/folders.
- Compression now supports local/remote files as `.gz` and folders as `.tar.gz`, with matching decompression for `.gz`, `.tar.gz`, and `.tgz` files.
- Added local and remote `Generate MD5`, creating a non-overwriting `<filename>.md5` sidecar as a visible Jobs pane task.
- Removed the redundant remote context-menu `Quick Look` entry; remote double-click, Space, and context-menu `Open` now all use editable remote local-copy semantics.
- Added a fixed V12 titlebar sidebar toggle beside the traffic lights plus a `Cmd+Option+B` shortcut.
- Fixed Change Timestamp dialog layout so its Year/Month/Day/Hour/Minute/Second fields stay inside the modal.
- Includes the v1.8.1-v1.8.9 development patch line documented below.

## v1.8.9 — Product milestone V2.8.9

V2.8.9 is a focused toolbar icon and transfer-auth reliability polish release.

- Uploads and downloads now fall back to the active SFTP connection when rsync cannot start because the SSH transfer channel requires passwordless login, including generic SSH `Permission denied` BatchMode failures.
- Remote delete now uses a server-side delete command when available, making large/deep folder deletes more reliable than recursive SFTP traversal.
- Pane toolbar icons for Home, Toggle Inspector, Upload, Download, and Delete are refreshed to match the requested visual direction while preserving the existing toolbar layout.
- Preferences are organized into General, Navigation, Jobs, Remote, Appearance, Shortcuts, and Diagnostics tabs; Shortcuts is explicitly a read-only reference.
- Remote sessions can be marked stale after macOS sleep or network resume and lazily reconnect on the next remote action before reporting failure.
- Navigation restore settings are split into local-on-launch, local-on-connect, and remote-on-connect; paired local/remote paths are remembered per remote profile using the last active tab.

## v1.8.8 — Product milestone V2.8.8

V2.8.8 is a job visibility and destructive-operation safety release.

- The bottom Transfer drawer is now a unified Jobs pane for upload, download, delete, and gzip work.
- Local and remote delete operations now enqueue as visible jobs after confirmation, so pane navigation/refresh can continue while deletion runs.
- Local and remote gzip operations now enqueue as visible jobs and fail without overwriting an existing `.gz` target.
- Remote gzip now runs on the remote side through the active SSH/SFTP connection instead of download-compress-upload.
- Preferences now includes `Delete source file after gzip compression`, off by default.
- Gzip source deletion only happens after successful compression; failed jobs preserve the source.
- Jobs show type-specific labels and icons for upload, download, gzip, and delete while preserving existing filters, retry failed, clear completed, pin, and auto-hide behavior.

## v1.8.7 — Product milestone V2.8.7

V2.8.7 is a workflow reliability release covering creation flow, stale remote sessions, remote preview cache reuse, optional auto-refresh, and transfer drawer clarity.

- Clicking the file-list blank area below rows now clears selection, matching blank-space behavior beside row metadata columns.
- New Folder dialogs now select the default name on open for immediate replacement typing.
- New Text File now uses the same naming dialog flow as New Folder for both local and remote panes.
- SFTP connections use keepalive and stale-connection cleanup; list/open failures caused by dropped sleep-idle connections now move the remote pane out of misleading Connected state.
- Inspector metadata now consistently uses `Kind`, matching the file-list column label, and always shows an Owner row with `—` when unavailable.
- Reopening a changed remote text/image preview now reuses the same local cache path within the session instead of creating a second temporary file.
- Preferences can optionally auto-refresh the active remote pane at a configured interval; the setting is off by default and defaults to 60 seconds when enabled.
- Remote directory listing avoids repeated slow owner-name lookups by caching resolved owner names and timing out slow lookups.
- Initial remote listing shows a loading state instead of briefly presenting an empty remote folder.
- The transfer drawer removes duplicate queue summary text and can show a collapsible per-file list for local folder uploads, including current file and completed/total file count.
- Follow-up fixes keep remote Owner values as usernames instead of sticky UID fallbacks, fill Inspector Owner from the parent listing when SFTP `stat` omits it, group the remote auto-refresh checkbox and interval field in Preferences, and collapse the transfer drawer header/filter/actions into one row.
- Context menus now separate selected-item actions from current-folder background actions, clamp to the visible window when opened near the bottom edge, and add single-file gzip compression for local and remote files without overwriting an existing `.gz` target.

## v1.8.6 — Product milestone V2.8.6

V2.8.6 is a compact V12 toolbar polish release.

- Pane toolbar buttons are grouped into compact capsules by navigation, file actions, and history controls.
- Toolbar glyphs are slightly larger without changing toolbar height, spacing, colors, or stroke width.
- Refresh icon tails are lengthened for clearer visual weight.
- V12 file-list headers remain sticky while scrolling long folders.

## v1.8.5 — Product milestone V2.8.5

V2.8.5 is a file-list and tab chrome polish release.

- File sizes now render with three significant digits across list cells, Inspector, and pane footer totals.
- V12 file-list columns can be resized by dragging header boundaries.
- Header right-click now opens a column menu; Name is mandatory, while Date modified, Size, Kind, Permission, and Owner are optional.
- Sort direction, tab close, and new-tab controls now use icons instead of text glyphs.
- V12 tabs are restyled with smoother Chrome-like curves and live in hidden-titlebar macOS window chrome.

## v1.8.4 — Product milestone V2.8.4

V2.8.4 is an Inspector and remote-edit polish release.

- Document icons now have more Finder-like depth with subtle page shading, fold treatment, and shadow.
- Remote Disconnect moved out of the file-operation toolbar into the remote status menu, reducing proximity to Delete.
- Folder Inspector now opens quickly and progressively updates slow directory details instead of blocking the whole Inspector.
- Successful remote edit uploads no longer leave a persistent Remote edits panel row; completion is surfaced in the transfer drawer and follows transfer auto-hide behavior.

## v1.8.3 — Product milestone V2.8.3

V2.8.3 is an Inspector detail and keyboard selection bugfix release.

- Folder Inspector metadata now shows folder size again for local and remote directories.
- V12 row selection highlight is limited to the Name column; clicking Date modified, Size, Kind, or list blank space clears selection.
- Plain `Up` / `Down` now move file selection through visible rows while preserving `Cmd+Up` / `Cmd+Down` and `Option+Up` / `Option+Down` page navigation.
- `Shift+Up` / `Shift+Down` now extends and shrinks contiguous row selection ranges.
- Inspector preview icons are larger and no longer sit inside a rounded-square wrapper.
- Document icons now use rounded outer and folded-corner geometry.

## v1.8.2 — Product milestone V2.8.2

V2.8.2 is a selection and Inspector shortcut bugfix release.

- Fixed `Shift` range selection in local and remote panes so it follows the visible sorted/filtered row order.
- `Cmd+I` now reveals Inspector for multi-selection, matching the toolbar Inspector toggle.
- Pressing `Cmd+I` again now hides the currently revealed pane Inspector.
- Show Inspector command paths no longer require exactly one selected item.

## v1.8.1 — Product milestone V2.8.1

V2.8.1 is a V12 layout cleanup release.

- Removed the redundant global toolbar from the V12 shell.
- Added pane-scoped one-row toolbars for local and remote actions, filters, Recent, History, and Clear Recent.
- Kept Copy Path on each pane breadcrumb row so the command is explicit to that pane.
- Moved Preferences to the V12 sidebar footer.
- Removed the extra remote header Disconnect link and placed connection status beside the remote pane title.
- Tightened pane headers into a single title/meta/status row, changed Preferences to a gear icon, compacted Recent/History/Clear Recent to icon controls, and gave Disconnect a persistent danger color.

## v1.8.0 — Product milestone V2.8

V2.8 chooses the Remote Quick Look track from the advanced navigation/preview plan.

- Space on a single selected remote file now opens the read-only remote preview flow for sniffed text/images.
- Remote context menus now expose Quick Look separately from Open and Edit.
- Remote Quick Look continues to use read-only preview cache semantics and does not upload viewer edits.
- Column View and recursive remote search remain deferred with explicit rationale.

## v1.7.0 — Product milestone V2.7

V2.7 refines the V12 interface and task surfaces.

- Tightened V12 control focus, hover, and disabled states.
- Added explicit empty folder states for local and remote panes.
- Added transfer drawer filters for All, Running, Failed, and Done.
- Made Inspector metadata denser and easier to scan.
- Documented the decision to defer real Column View until it can be implemented fully.
- Added a V12 layout regression checklist for release-candidate visual review.

## v1.6.0 — Product milestone V2.6

V2.6 hardens the remote text edit workflow for daily use.

- Remote edit sessions show local cache path context and last upload status.
- Added explicit Save Back Now, Stop Monitoring, and Discard Local Copy actions.
- Deleted local edit-cache files are marked as failed with a clear message.
- Transient upload failures get bounded safe retries without bypassing conflict checks.
- Conflict recovery can download the newer remote copy beside the local edit and copy both paths for manual comparison.
- Added an isolated fake-SFTP edit-session harness covering happy path, conflict, disconnect, and shutdown-safe cleanup behavior.

## v1.5.0 — Product milestone V2.5

V2.5 introduces the first write-capable remote text edit workflow.

- Added **Edit Remote File** as a separate command from read-only Open for sniffed remote text files.
- Edit sessions download into a separate app-managed cache and open with the configured text editor.
- Local saves are watched and uploaded back to the same remote path after remote baseline checks.
- Remote changes made after the edit session begins trigger a conflict instead of a silent overwrite.
- The Remote edits panel shows active edit sessions, status, failures/conflicts, and recovery actions to reveal the local copy, re-download, force upload after confirmation, or close/discard.
- Existing remote Open preview remains read-only and separate from Edit.

## v1.4.0 — Product milestone V2.4

V2.4 focuses V12 command ownership and visual polish.

- Added pane-scoped local and remote action strips so pane-owned commands can be invoked directly from that pane.
- Removed unavailable Column View/List View toolbar controls from the global toolbar.
- Lightened shared folder icons toward Finder-style blue.
- Kept global/session commands in the top toolbar.

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
