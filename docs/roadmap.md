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
| V2.2 | v1.2.0 | Planned |

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
| V2.2 | v1.2.0 | v1.1 Feedback Fixes — planned |

## Latest Shipped Phase

### V2.1 / v1.1.0 — v1.0 Feedback Stabilization

V2.1 is driven by v1.0.0 hands-on feedback. It prioritized correctness bugs before broader polish:

- Transfer startup latency, Unicode path transfer support, and folder upload target semantics.
- Remote folder delete and local/remote New Folder reliability.
- Better text sniffing for remote preview, including `.bed`-style text files.
- Inspector becomes the single Info surface; the Get Info modal is removed.
- Restore last local/remote path preferences, Home and Copy Current Path navigation actions, stronger active-pane indicator.
- macOS Preferences menu entry and resizable sidebar.

See **`docs/dev/V2.1_PLAN.md`** for the detailed triage and acceptance checks.

## Planned Next Phase

### V2.2 / v1.2.0 — v1.1 Feedback Fixes

V2.2 is a corrective release for v1.1.0 hands-on feedback. It focuses on operations that appear unresponsive or surprising:

- Delete confirmation should close or become busy immediately after confirmation, preventing repeated delete submissions.
- New Folder must be re-tested and fixed for local and remote toolbar/context paths.
- Preferences should allow a default text editor for remote text preview, including TextMate.
- Inspector must not auto-open on ordinary single-click and squeeze the file list.
- Copy Current Path needs a discoverable shortcut and shortcut-reference entry.
- Open Terminal Here / Open SSH Terminal Here should work from pane background context menus and use intuitive folder/file target semantics.
- Remote SSH terminal launch must preserve the requested path even when remote startup files contain `cd ...`.

See **`docs/dev/V2.2_PLAN.md`** for the detailed triage and acceptance checks.

## Explicitly out of scope or not on the main line (today)

These remain **unsupported**, **deferred**, or **non-goals** across current plans unless a future milestone explicitly adopts them:

- **Remote edit auto-sync**
- **Full Remote Quick Look**. A limited read-only remote preview cache for text/images exists from **V1.3**; it is not a full macOS Quick Look equivalent and does not support editing/sync.
- **Indexed/full-text search** (V1.7 only filters current listings and suggests already-known paths)
- **Full ACL editor / remote shell file-manager mode** (V1.8 ships curated remote operations only)
- **Full i18n** (no localized product shell in near phases)
- **Plugin-sized Preferences UI** (V1.6 keeps preferences curated and small)
- **Cross-platform** support (macOS-only product)
- **IDE-like** features (project model, SCM integration, etc.)

Drag-and-drop transfer, marquee selection, Preferences MVP, navigation efficiency, remote operations expansion, and reliability/diagnostics work shipped together in **v1.0.0**. Intermediate development targets `v0.6.0` through `v0.10.0` were not published as standalone tags.

V2.0 is the current stable personal release. Public distribution notes should still record unsigned/signing status honestly for the provided dmg/zip artifacts.
