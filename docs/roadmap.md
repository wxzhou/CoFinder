# CoFinder Roadmap

## How to read this document

- **`README.md`** and **`CHANGELOG.md`** are the authoritative record of **what has shipped** (semver releases and user-facing facts).
- **`docs/dev/V1.*_PLAN.md`** files are the source for **milestone execution scope** (acceptance, risks, file touch lists).
- **This file** is a **high-level roadmap** only: phase themes, target releases, and boundaries. It is **not** a step-by-step acceptance checklist.

For the canonical **product milestone ↔ semver** table, see **README.md → Versioning**.

| Product milestone | Target release | Status |
| --- | --- | --- |
| V1 | v0.1.0 | Shipped |
| V1.1 | v0.2.0 | Shipped |
| V1.2 | v0.3.0 | Shipped |
| V1.3 | v0.4.0 | Shipped |
| V1.4 | v0.5.0 | Shipped |
| V1.5 | no standalone tag | Included in v1.0.0 |
| V1.6 | no standalone tag | Included in v1.0.0 |
| V1.7 | no standalone tag | Included in v1.0.0 |
| V1.8 | no standalone tag | Included in v1.0.0 |
| V1.9 | no standalone tag | Included in v1.0.0 |
| V2.0 | v1.0.0 | Shipped |
| V2.1 | v1.1.0 | Shipped |
| V2.2 | v1.2.0 | Shipped |
| V2.3 | v1.3.0 | Shipped |
| V2.4 | v1.4.0 | Complete on dev |
| V2.5 | v1.5.0 | Complete on dev |
| V2.6 | v1.6.0 | Complete on dev |
| V2.7 | v1.7.0 | Complete on dev |
| V2.8 | v1.8.0 | Complete on dev |
| V2.8.1 | v1.8.1 | Complete on dev |
| V2.8.2 | v1.8.2 | Complete on dev |
| V2.8.3 | v1.8.3 | Complete on dev |
| V2.8.4 | v1.8.4 | Complete on dev |
| V2.8.5 | v1.8.5 | Complete on dev |
| V2.8.6 | v1.8.6 | Complete on dev |
| V2.8.7 | v1.8.7 | Complete on dev |
| V2.8.8 | v1.8.8 | Complete on dev |
| V2.8.9 | v1.8.9 | Complete on dev |
| V2.9 release rollup | v1.9.0 | Shipped |
| V2.10 planning | v1.9.1 | Planning branch |
| V2.10 M1 | v1.9.2 | Complete on dev |
| V2.10 M2 | v1.9.3 | Complete on dev |
| V2.10 M3 | v1.9.4 | Complete on feature branch |
| V2.10 M4 | v1.9.5 | Complete on feature branch |
| V2.10 M5 | v1.9.6 | Complete on feature branch |
| V2.10 M6 | v1.9.7 | Complete on feature branch |
| V2.10 M7 | v1.9.8 | Complete on feature branch |
| V2.10 M8 | v1.9.9 | In progress on feature branch |

## Shipped phases (summary)

### V1 / v0.1.0

Core dual-pane **local** browsing and **SFTP** remote browsing, **multi-tab** isolation, **Site Manager** with profiles and optional **`safeStorage`** credentials, **global serial rsync** upload/download queue, multi-select and context menus, **macOS packaging** (dmg/zip) and baseline docs/security/smoke.

### V1.1 / v0.2.0

**Rename** and **delete** (with confirmation), **Get Info** (local + remote), **local Quick Look** (remote explicitly unsupported), selection and UI polish, expanded tests and smoke/release documentation.

### V1.2 / v0.3.0

**V12 production shell** as the **default** UI (legacy classic opt-in), **local sidebar favorites**, **per-pane inspector**, **embedded remote connect**, toolbar and **compact transfer drawer** wired to existing handlers; scoped v12 CSS and updated checklists.

## Phase Overview

Themes align with **`docs/dev/V1.3_PLAN.md`** … **`docs/dev/V2.0_PLAN.md`**. Scope may narrow per milestone during implementation.

| Phase | Release | Theme |
| --- | --- | --- |
| V1.3 | v0.4.0 | Interaction Efficiency & Layout Control + limited read-only remote preview — shipped |
| V1.4 | v0.5.0 | Transfer Safety & Conflict Handling — shipped |
| V1.5 | no standalone tag | Drag-and-Drop Transfer & Selection — included in v1.0.0 |
| V1.6 | no standalone tag | Preferences MVP — included in v1.0.0 |
| V1.7 | no standalone tag | Search, Filter, and Navigation — included in v1.0.0 |
| V1.8 | no standalone tag | Remote Operations Expansion — included in v1.0.0 |
| V1.9 | no standalone tag | Packaging, Updates, and Reliability — included in v1.0.0 |
| V2.0 | v1.0.0 | Stable Personal Release — shipped |
| V2.1 | v1.1.0 | v1.0 Feedback Stabilization — shipped |
| V2.2 | v1.2.0 | v1.1 Feedback Fixes — shipped |
| V2.3 | v1.3.0 | v1.2 Navigation Feedback Fixes — shipped |
| V2.4 | v1.4.0 | Pane-Scoped Toolbar and Finder Visual Polish — complete on dev |
| V2.5 | v1.5.0 | Remote Text Edit Auto-Sync MVP — complete on dev |
| V2.6 | v1.6.0 | Remote Edit Reliability and Session Management — complete on dev |
| V2.7 | v1.7.0 | V12 UI Refinement and Task-Center Polish — complete on dev |
| V2.8 | v1.8.0 | Remote Quick Look — complete on dev |
| V2.8.1 | v1.8.1 | Pane-Scoped Toolbar Cleanup — complete on dev |
| V2.8.2 | v1.8.2 | Selection and Inspector Shortcut Fixes — complete on dev |
| V2.8.3 | v1.8.3 | Inspector Detail and Keyboard Selection Fixes — complete on dev |
| V2.8.4 | v1.8.4 | Inspector and Remote Edit Polish — complete on dev |
| V2.8.5 | v1.8.5 | File List Columns and Tab Chrome Polish — complete on dev |
| V2.8.6 | v1.8.6 | Toolbar Capsule and Sticky Header Polish — complete on dev |
| V2.8.7 | v1.8.7 | Creation Flow, Remote Refresh, and Transfer Detail Fixes — complete on dev |
| V2.8.8 | v1.8.8 | Unified Jobs Pane and Destructive Task Queue — complete on dev |
| V2.8.9 | v1.8.9 | Toolbar Icon and Transfer Reliability Polish — complete on dev |
| V2.9 release rollup | v1.9.0 | Stability rollup after v1.8.0 — shipped |
| V2.10 planning | v1.9.1 | Hard-feature design and version sequencing — planning branch |
| V2.10 M1 | v1.9.2 | Multi-lane Jobs scheduler and path locks — complete on dev |
| V2.10 M2 | v1.9.3 | Remote Copy To / Move To jobs — complete on dev |
| V2.10 M3 | v1.9.4 | Grep/Search Contents and read-only text viewer — complete on feature branch |
| V2.10 M4 | v1.9.5 | Expandable list rows / outline mode — complete on feature branch |
| V2.10 M5 | v1.9.6 | View-mode foundation and icon view — complete on feature branch |
| V2.10 M6 | v1.9.7 | Column view — complete on feature branch |
| V2.10 M7 | v1.9.8 | Gallery view — complete on feature branch |
| V2.10 M8 | v1.9.9 | Post-view-mode optimization and debug — in progress on feature branch |

## Latest Completed Phase

### V2.5 / v1.5.0 — Remote Text Edit Auto-Sync MVP

V2.5 introduces the first write-capable remote edit workflow with tight text-only scope:

- Separate **Edit Remote File** entry point for sniffed text files; **Open** remains read-only preview.
- Edit cache isolation from read-only preview cache.
- Local save watching with debounced upload and remote-baseline conflict checks.
- Conflict/failure recovery actions and compact Remote edits status panel.

**Superseded on dev after V2.8.9:** remote **Open** now also uses the writable local-copy session model, with default-app opening and save-back conflict checks. Remote **Edit** remains the explicit text-editor opener.

See **`docs/dev/V2.5_PLAN.md`** for the detailed acceptance checks.

### V2.6 / v1.6.0 — Remote Edit Reliability and Session Management

V2.6 hardens remote editing after the MVP:

- Richer edit-session detail and explicit manual actions.
- Safer watcher behavior for atomic saves, deleted cache files, and transient upload retries.
- Conflict-copy recovery for manual comparison without automatic merge.
- Isolated fake-SFTP harness for repeatable edit-session regression tests.

See **`docs/dev/V2.6_PLAN.md`** for the detailed acceptance checks.

### V2.7 / v1.7.0 — V12 UI Refinement and Task-Center Polish

V2.7 improves the V12 daily-use surface:

- Tighter control states and empty pane states.
- Transfer task filters.
- Denser Inspector metadata.
- Explicit Column View deferral.
- Manual layout regression checklist.

See **`docs/dev/V2.7_PLAN.md`** for the detailed acceptance checks.

### V2.8 / v1.8.0 — Remote Quick Look

V2.8 chooses Track B from the advanced navigation/preview decision:

- Space opens read-only preview for a single selected remote text/image file.
- Remote context menu has Quick Look separate from Open and Edit.
- Column View and recursive remote search remain deferred.

**Superseded on dev after V2.8.9:** remote Quick Look is no longer a separate right-click action. Space now follows remote **Open** and creates a writable local-copy session.

See **`docs/dev/V2.8_PLAN.md`** and **`docs/dev/V2.8_DECISION.md`**.

### V2.8.1 / v1.8.1 — Pane-Scoped Toolbar Cleanup

V2.8.1 is a V12 patch release for command placement:

- Removed the active-pane-dependent global toolbar.
- Moved navigation, inspector, operation, filter, Recent, History, and Clear Recent controls into one toolbar row per pane.
- Kept Copy Path on each pane breadcrumb row.
- Moved Preferences to a compact gear in the sidebar footer.
- Moved pane meta/status beside pane titles, removed the duplicate header Disconnect link, and compacted Recent/History/Clear Recent to icon controls.

See **`docs/dev/V2.8.1_PLAN.md`**.

### V2.8.2 / v1.8.2 — Selection and Inspector Shortcut Fixes

V2.8.2 fixes hands-on regressions found in v1.8.1:

- `Shift` range selection now uses the visible sorted/filtered row order in local and remote panes.
- `Cmd+I` now toggles the current pane Inspector for one or more selected files.
- Show Inspector command paths can reveal Inspector for multi-selection.

See **`docs/dev/V2.8.2_PLAN.md`**.

### V2.8.3 / v1.8.3 — Inspector Detail and Keyboard Selection Fixes

V2.8.3 fixes hands-on regressions found in v1.8.2:

- Folder Inspector metadata shows folder size again.
- Row selection highlight is constrained to the Name column, and non-name row areas clear selection.
- Plain `Up` / `Down` move selection through visible rows; `Shift+Up` / `Shift+Down` extends ranges.
- Existing `Cmd+Up` / `Cmd+Down` and `Option+Up` / `Option+Down` page navigation behavior remains unchanged.
- Inspector preview and document icons are polished closer to Finder-style visual expectations.

See **`docs/dev/V2.8.3_PLAN.md`**.

### V2.8.4 / v1.8.4 — Inspector and Remote Edit Polish

V2.8.4 fixes hands-on polish issues found in v1.8.3:

- Document icons gain subtler Finder-like depth while keeping rounded page and folded-corner geometry.
- Remote Disconnect moves from the toolbar to the Connected status menu, separating connection/session actions from file deletion.
- Folder Inspector loads immediately available metadata first, then updates slow directory details in place.
- Successful remote edit uploads leave the Remote edits panel and appear in the transfer drawer with normal auto-hide behavior.

See **`docs/dev/V2.8.4_PLAN.md`**.

### V2.8.5 / v1.8.5 — File List Columns and Tab Chrome Polish

V2.8.5 continues V12 UI polish:

- File sizes use three significant digits across file lists, Inspector, and pane footers.
- File-list columns are resizable and optional from a header context menu.
- Permission and Owner columns are available without making Name optional.
- Sort and tab controls use icons instead of text glyphs.
- The macOS titlebar is hidden so tabs share the visual chrome row with traffic lights.

See **`docs/dev/V2.8.5_PLAN.md`**.

### V2.8.6 / v1.8.6 — Toolbar Capsule and Sticky Header Polish

V2.8.6 keeps the V12 layout stable while refining toolbar grouping and long-list behavior:

- Pane toolbar controls are grouped into navigation, file action, and history capsules.
- Toolbar glyphs are enlarged in place without changing toolbar height or spacing.
- Refresh arrows have longer tails for clearer recognition.
- File-list headers stay visible while scrolling long folders.

### V2.8.7 / v1.8.7 — Creation Flow, Remote Refresh, and Transfer Detail Fixes

V2.8.7 fixes hands-on workflow issues found after the toolbar polish:

- Clicking blank file-list space below rows clears selection.
- New Folder selects the default name immediately on dialog open.
- New Text File uses the same explicit naming dialog as New Folder.
- Stale SFTP sessions caused by sleep/idle disconnects are detected and the remote pane leaves misleading Connected state.
- Inspector uses `Kind` consistently and includes Owner.
- Read-only remote preview reuses the same local cache path for the same remote file within a session.
- Optional remote pane auto-refresh can be enabled in Preferences.
- Remote list responsiveness is improved by caching owner lookups and bounding slow owner resolution.
- Transfer drawer avoids duplicate summary text and shows collapsible child-file progress for local folder uploads.
- Context menus distinguish selected-item actions from background current-folder actions, stay within the viewport, and offer single-file gzip compression.

See **`docs/dev/V2.8.7_PLAN.md`**.

### V2.8.8 / v1.8.8 — Unified Jobs Pane and Destructive Task Queue

V2.8.8 turns long-running work into explicit jobs:

- The Transfer drawer becomes a Jobs pane for upload, download, delete, and gzip work.
- Delete and gzip operations enqueue as visible jobs instead of blocking the pane interaction.
- Remote gzip runs remotely and preserves the source by default.
- Preferences controls whether gzip deletes the source after successful compression; the default is to keep the source.

See **`docs/dev/V2.8.8_PLAN.md`**.

### V2.9 release rollup / v1.9.0 — Stability Rollup

V2.9 is a release packaging target rather than a new feature milestone. It publishes the stable state reached after hands-on use and the V2.8.1-V2.8.9 patch line:

- Pane-scoped toolbar cleanup, tab/file-list polish, sticky headers, and Change Timestamp dialog layout fix.
- Remote Open/Edit unified writable local-copy sessions and removal of the misleading separate remote Quick Look command.
- Jobs pane reliability for upload/download/delete/compress/decompress/MD5 operations.
- SFTP fallback for password-authenticated upload/download when rsync cannot authenticate non-interactively.
- Server-side remote delete for large/deep folders.
- Expanded File Operation submenu: Touch, Change Timestamp, Compress/Decompress, Generate MD5, and remote Change Permissions.

See **`docs/dev/V2.9_RELEASE_PLAN.md`**.

### V2.10 planning / v1.9.x — Hard-Feature Track

V2.10 is the development track after the stable `v1.9.0` release. Development builds use `v1.9.x` versions and should record user-visible changes carefully so the next public release can be cut as either `v1.10.0` or `v2.0.0` after hands-on stability testing.

Recommended order:

1. **v1.9.1:** planning branch only. Bump development version, document the sequence, and avoid runtime code changes.
2. **v1.9.2:** multi-lane Jobs scheduler. This is the dependency for safer long-running remote copy/move and content search work.
3. **v1.9.3:** remote `Copy To...` and `Move To...`. These are core file-management actions and should live in the remote selected-item top-level context menu near Rename/Delete, not inside `File Operation`.
4. **v1.9.4:** `Search Contents...` and `View Text...` for grep/less-style workflows. These are expert/inspection tools and should live under `File Operation`.
5. **v1.9.5:** expandable list rows with a Preferences toggle. This extends the current list view before adding separate view modes.
6. **v1.9.6:** view-mode foundation plus icon view. Local and remote panes can choose view modes independently.
7. **v1.9.7:** column view, after the shared view-mode state and pane-independent rendering are proven.
8. **v1.9.8:** gallery view, after preview caching and large-file guardrails are reused safely.
9. **v1.9.9:** post-view-mode optimization and debug. Focus on submenu hover intent, toolbar/menu view controls, always-on list disclosure controls, modal close consistency, list indentation stability, View Text latency review, and Finder-like Gallery layout corrections.

See **`docs/dev/V2.10_HARD_FEATURES_PLAN.md`** and the current **`CHANGELOG.md`** unreleased section.

### V2.8.9 / v1.8.9 — Toolbar Icon and Transfer Reliability Polish

V2.8.9 keeps the V12 layout stable and tightens a few hands-on rough edges:

- Upload/download fall back to the active SFTP connection when rsync cannot start because the SSH transfer channel requires passwordless login.
- Deep remote folder delete uses a server-side command path when available, avoiding fragile recursive SFTP traversal.
- Pane toolbar icons for Home, Toggle Inspector, Upload, Download, and Delete are refreshed without changing toolbar height, grouping, spacing, or command behavior.

See **`docs/dev/V2.8.9_PLAN.md`**.

### V2.4 / v1.4.0 — Pane-Scoped Toolbar and Finder Visual Polish

V2.4 addresses V12 command ownership and visible polish before larger remote-edit work:

- Pane-scoped action strips for local/remote operations.
- Top toolbar kept for global/session navigation commands. Superseded in V2.8.1 by fully pane-scoped toolbar rows.
- Removed unavailable view-mode toolbar controls.
- Folder icon palette tuned lighter and closer to Finder.

See **`docs/dev/V2.4_PLAN.md`** for the detailed acceptance checks.

### V2.3 / v1.3.0 — v1.2 Navigation Feedback Fixes

V2.3 is a focused polish release for v1.2.0 hands-on feedback:

- Preferences now shows explicit text-editor choices for System default, TextEdit, TextMate, and Custom.
- Copy Current Path keeps the `Cmd+Option+C` shortcut but detects the physical C key for macOS reliability.
- V12 breadcrumbs and address entry are integrated: breadcrumb is the default view, while empty breadcrumb click, breadcrumb double-click, or `Cmd+L` switches to full path input.
- Enter submits path navigation; Escape or blur returns to breadcrumb mode.
- Copy Path is available from the breadcrumb area, and Filter names / Recent / History remain nearby without a duplicate address field.

See **`docs/dev/V2.3_PLAN.md`** for the detailed triage and acceptance checks.

### V2.2 / v1.2.0 — v1.1 Feedback Fixes

V2.2 is a corrective release for v1.1.0 hands-on feedback. It focused on operations that appeared unresponsive or surprising:

- Delete confirmation closes immediately after confirmation, duplicate delete submissions are guarded, and pane busy banners show long-running delete work.
- Local and remote New Folder use an in-app dialog instead of hidden/unreliable system prompts.
- Preferences can choose the default text editor for remote text preview, including TextMate.
- Inspector no longer auto-opens on ordinary single-click and squeezes the file list.
- Copy Current Path documents the `Cmd+Option+C` shortcut in the toolbar tooltip and Preferences reference.
- Open Terminal Here / Open SSH Terminal Here works from pane background context menus and uses intuitive folder/file parent target semantics.
- Remote SSH terminal launch preserves the requested path even when remote startup files contain `cd ...`.

See **`docs/dev/V2.2_PLAN.md`** for the detailed triage and acceptance checks.

### V2.1 / v1.1.0 — v1.0 Feedback Stabilization

V2.1 is driven by v1.0.0 hands-on feedback. It prioritized correctness bugs before broader polish:

- Transfer startup latency, Unicode path transfer support, and folder upload target semantics.
- Remote folder delete and local/remote New Folder reliability.
- Better text sniffing for remote preview, including `.bed`-style text files.
- Inspector becomes the single Info surface; the Get Info modal is removed.
- Restore last local/remote path preferences, Home and Copy Current Path navigation actions, stronger active-pane indicator.
- macOS Preferences menu entry and resizable sidebar.

See **`docs/dev/V2.1_PLAN.md`** for the detailed triage and acceptance checks.

## Explicitly out of scope or not on the main line (today)

These remain **unsupported**, **deferred**, or **non-goals** across current plans unless a future milestone explicitly adopts them:

- **Unrestricted binary/document remote edit auto-sync**. Remote **Open** can use default macOS apps through app-managed local-copy sessions, but broad binary/document workflows still require cautious manual verification because app save behavior varies.
- **Separate full Remote Quick Look**. The previous read-only remote preview / Quick Look path is superseded on dev by writable remote Open/Edit local-copy sessions. A true non-editing Quick Look would need a new explicit future design.
- **Unrestricted parallel jobs**. v1.9.2 implements bounded multi-lane Jobs for transfer/delete/compression work; future lanes must keep the same lane-specific concurrency and path-lock model, not unrestricted global parallel execution.
- **Remote gzip percentage progress**. Do not implement approximate percentage progress from sampling or `.gz` output growth; see `docs/dev/remote-gzip-progress-decision.md`.
- **Remote/content `grep` and `less` tools**. These are planned in the V2.10 hard-feature track; see `docs/dev/V2.10_HARD_FEATURES_PLAN.md`.
- **Real Column View**. V2.7 defers it deliberately; see `docs/dev/column-view-decision.md`.
- **Indexed/full-text search** (V1.7 only filters current listings and suggests already-known paths)
- **Full ACL editor / remote shell file-manager mode** (V1.8 ships curated remote operations only)
- **Full i18n** (no localized product shell in near phases)
- **Plugin-sized Preferences UI** (V1.6 keeps preferences curated and small)
- **Cross-platform** support (macOS-only product)
- **IDE-like** features (project model, SCM integration, etc.)

Drag-and-drop transfer, marquee selection, Preferences MVP, navigation efficiency, remote operations expansion, and reliability/diagnostics work shipped together in **v1.0.0**. Intermediate development targets `v0.6.0` through `v0.10.0` were not published as standalone tags.

V2.10 / v1.9.x is the current development track. `v1.9.x` builds are development checkpoints; the next public release should be cut as `v1.10.0` if the track is mostly evolutionary, or `v2.0.0` if multi-lane Jobs, remote copy/move, content tools, and multiple view modes all ship and survive hands-on use.
