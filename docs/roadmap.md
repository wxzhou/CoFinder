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
| V1.5 | v0.6.0 | Implemented in dev tree (not shipped until tagged) |
| V1.6 | v0.7.0 | Implemented in dev tree (not shipped until tagged) |
| V1.7 | v0.8.0 | Implemented in dev tree (not shipped until tagged) |
| V1.8 | v0.9.0 | Implemented in dev tree (not shipped until tagged) |
| V1.9 | v0.10.0 | Implemented in dev tree (not shipped until tagged) |
| V2.0 | v1.0.0 | Planned stable release |

## Shipped phases (summary)

### V1 / v0.1.0

Core dual-pane **local** browsing and **SFTP** remote browsing, **multi-tab** isolation, **Site Manager** with profiles and optional **`safeStorage`** credentials, **global serial rsync** upload/download queue, multi-select and context menus, **macOS packaging** (dmg/zip) and baseline docs/security/smoke.

### V1.1 / v0.2.0

**Rename** and **delete** (with confirmation), **Get Info** (local + remote), **local Quick Look** (remote explicitly unsupported), selection and UI polish, expanded tests and smoke/release documentation.

### V1.2 / v0.3.0

**V12 production shell** as the **default** UI (legacy classic opt-in), **local sidebar favorites**, **per-pane inspector**, **embedded remote connect**, toolbar and **compact transfer drawer** wired to existing handlers; scoped v12 CSS and updated checklists.

## Planned phases (overview)

Themes align with **`docs/dev/V1.3_PLAN.md`** … **`docs/dev/V2.0_PLAN.md`**. Scope may narrow per milestone during implementation.

| Phase | Release | Theme |
| --- | --- | --- |
| V1.3 | v0.4.0 | Interaction Efficiency & Layout Control + limited read-only remote preview — shipped |
| V1.4 | v0.5.0 | Transfer Safety & Conflict Handling — shipped |
| V1.5 | v0.6.0 | Drag-and-Drop Transfer & Selection — implemented in dev tree |
| V1.6 | v0.7.0 | Preferences MVP — implemented in dev tree |
| V1.7 | v0.8.0 | Search, Filter, and Navigation — implemented in dev tree |
| V1.8 | v0.9.0 | Remote Operations Expansion — implemented in dev tree |
| V1.9 | v0.10.0 | Packaging, Updates, and Reliability — implemented in dev tree |
| V2.0 | v1.0.0 | Stable Personal Release |

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

Drag-and-drop transfer, marquee selection, Preferences MVP, navigation efficiency, remote operations expansion, and reliability/diagnostics work are implemented in the development tree. They remain unshipped until their matching release tags are created.
