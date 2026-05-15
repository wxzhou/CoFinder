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

## Latest Completed Phase

### V2.5 / v1.5.0 — Remote Text Edit Auto-Sync MVP

V2.5 introduces the first write-capable remote edit workflow with tight text-only scope:

- Separate **Edit Remote File** entry point for sniffed text files; **Open** remains read-only preview.
- Edit cache isolation from read-only preview cache.
- Local save watching with debounced upload and remote-baseline conflict checks.
- Conflict/failure recovery actions and compact Remote edits status panel.

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

- **Binary/document remote edit auto-sync**. V2.5/V2.6 plan text-file-only remote edit workflows first.
- **Full Remote Quick Look**. A limited read-only remote preview cache for text/images exists from **V1.3**; V2.8 may choose a broader remote Quick Look track, but it remains deferred until then.
- **Real Column View**. V2.7 defers it deliberately; see `docs/dev/column-view-decision.md`.
- **Indexed/full-text search** (V1.7 only filters current listings and suggests already-known paths)
- **Full ACL editor / remote shell file-manager mode** (V1.8 ships curated remote operations only)
- **Full i18n** (no localized product shell in near phases)
- **Plugin-sized Preferences UI** (V1.6 keeps preferences curated and small)
- **Cross-platform** support (macOS-only product)
- **IDE-like** features (project model, SCM integration, etc.)

Drag-and-drop transfer, marquee selection, Preferences MVP, navigation efficiency, remote operations expansion, and reliability/diagnostics work shipped together in **v1.0.0**. Intermediate development targets `v0.6.0` through `v0.10.0` were not published as standalone tags.

V2.8.3 / v1.8.3 is the current completed development target on `dev`; publish status still depends on tagging and release artifacts. Public distribution notes should still record unsigned/signing status honestly for the provided dmg/zip artifacts.
