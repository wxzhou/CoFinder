# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP. It focuses on stable dual-pane local/remote browsing plus rsync-based transfer queue workflows for personal daily use.

**`package.json` version:** `1.6.0`. **Latest completed development release:** **v1.6.0**.

## Versioning

CoFinder uses two parallel naming schemes:

- **Product milestone** (V1, V1.1, V1.2, …): labels for development phases and plan documents (`docs/dev/V1.*_PLAN.md`, `docs/roadmap.md`). They do **not** equal the numeric field in `package.json`.
- **Release version** (semver): what ships in **git tags**, **GitHub Releases**, and distributed macOS artifacts. Released versions are listed below.

Past releases are **not** retroactively re-tagged. Product milestone **V1.4** shipped as **`v0.5.0`**. Milestones **V1.5-V1.9** were development milestones that shipped together in **V2.0 / `v1.0.0`**; there are no standalone `v0.6.0` through `v0.10.0` tags.

| Product milestone | Release version / tag | Status |
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

## V1 Status

- **V1 is complete.**
- **V1.1 is complete** (shipped in the 0.2.x line).
- **V1.2 shell (M1–M6) is complete** as the **default** UI — see **Implemented in V1.2** below. Shipped as **v0.3.0** (see CHANGELOG).

### Implemented in V1.2

- Finder-first production shell (`AppShellV12`) for real local/remote browsing, path chrome, and tab strip — **default** in dev and packaged builds (`src/renderer/uiMode.ts`, `src/renderer/main.tsx`, `src/main/main.ts`). **Legacy classic UI:** renderer URL **`?ui=v11`** or **`?legacy=1`**, or **`COFINDER_LEGACY_UI=1`** (Electron main, runtime), or **`VITE_COFINDER_LEGACY_UI=1`** at build time. **`COFINDER_V12_MOCKUP=1`** is still the static `?mockup=v12` mockup only (dev).
- **M6 default:** V1.2 shell is the default; classic UI is opt-in legacy only.
- Per-pane inspector, embedded remote connect (shared connect path with Site Manager), toolbar and compact transfer drawer wired to existing V1.1 handlers; v12-scoped CSS polish and docs (`docs/dev/V1.2_PLAN.md`, `docs/smoke-test.md`, `docs/release-checklist.md`).

Regression for the default shell: run the **V1.2** subsection in `docs/smoke-test.md`, then the overlapping **V1.1** sections (transfers, selection, Site Manager, Quick Look). For classic UI parity, repeat with **`?ui=v11`** or **`COFINDER_LEGACY_UI=1`**.

### Implemented in V1.1

- Inline rename (local + remote) and delete with confirmation
- Get Info (local + remote) including async directory size where applicable
- macOS-style UI polish (active pane, selection contrast, queue status chips, context menu spacing)
- Quick Look for local files (context menu + `Space`); explicit unsupported path for remote
- Selection hardening, regression tests, and smoke/release checklist updates

### Implemented in V1

- Local file browsing (navigation, sorting, status bar, open/reveal)
- SFTP remote browsing and connect/disconnect flow
- Multi-tab session isolation
- Site Manager (profile CRUD + login manager)
- Password save via Electron `safeStorage` when available
- rsync upload/download serial transfer queue
- Multi-select (`Cmd`/`Shift` click + `Cmd/Ctrl+A`)
- Basic context menus (local + remote file panes)
- **M5 — release hardening:** centralized IPC validation; unified `{ ok, data }` / `{ ok, error }` responses; quit-time SFTP disconnect and transfer queue shutdown; `ssh`/`rsync` with augmented `PATH` when packaged; `local:getHomePath` for initial local pane; optional diagnostics (`COFINDER_DEBUG=1`, `main.log` under app userData)
- **M5 — packaging:** `electron-builder` (macOS dmg + zip), `npm run package` / `npm run dist`, artifacts under `release/`
- **M5 — documentation:** `docs/smoke-test.md`, `docs/release-checklist.md`, `docs/security.md`, `docs/roadmap.md`; `npm run check:secrets`

### Not Supported in v1.0.0

- Remote edit auto-sync workflow
- Full Quick Look for remote files
- Full-disk or content search; V1.7 filtering only narrows the current visible listing by file/folder name.
- Full remote ACL editor; V1.8 only supports basic octal chmod.
- Remote duplicate for directories or files larger than 50 MB.
- Full i18n

### Implemented in V2.1 / v1.1.0

V2.1 is a v1.0 feedback stabilization release. It fixes transfer startup latency, Unicode path transfer support, folder upload target semantics, remote folder deletion, New Folder reliability, `.bed` text preview opening, Inspector/Get Info consolidation, restore-last-path behavior, Home/Copy Current Path navigation, active-pane visibility, macOS Preferences menu integration, and resizable sidebar.

Detailed scope lives in `docs/dev/V2.1_PLAN.md`.

### Implemented in V2.2 / v1.2.0

V2.2 is a v1.1 feedback fix release. It improves delete feedback and duplicate-submit guarding, replaces New Folder prompts with an in-app dialog, adds a default text editor preference for remote text preview, prevents single-click Inspector auto-reveal, documents the Copy Current Path shortcut, and fixes local/remote Terminal Here context semantics including robust SSH path preservation.

Detailed scope lives in `docs/dev/V2.2_PLAN.md`.

### Implemented in V2.3 / v1.3.0

V2.3 is a v1.2 feedback polish release. It makes the text-editor preference an explicit selector, fixes `Cmd+Option+C` Copy Current Path reliability on macOS, and merges the V12 breadcrumb/address bar flow: breadcrumbs are the default path surface, with full path entry available from breadcrumb empty click, breadcrumb double-click, or `Cmd+L`.

Detailed scope lives in `docs/dev/V2.3_PLAN.md`.

### Implemented in V2.4 / v1.4.0

V2.4 reduces V12 toolbar ambiguity by moving pane-owned commands into local and remote pane action strips, removes unavailable view-mode toolbar controls, and lightens folder icons toward Finder-style blue.

Detailed scope lives in `docs/dev/V2.4_PLAN.md`.

### Implemented in V2.5 / v1.5.0

V2.5 adds a separate **Edit Remote File** workflow for sniffed text files. The workflow downloads a remote text file into an app-managed edit cache, opens it with the configured text editor, watches local saves, and uploads changes back only after confirming the remote file still matches the edit-session baseline. Conflicts preserve the local edit copy and expose recovery actions for re-download, explicit force-upload, reveal, or close/discard. Existing **Open** remains read-only preview behavior.

Detailed scope lives in `docs/dev/V2.5_PLAN.md`.

### Implemented in V2.6 / v1.6.0

V2.6 hardens remote edit sessions with richer session status, explicit Save Back Now / Stop Monitoring / Discard actions, deleted-cache handling, bounded transient retry, safer conflict-copy recovery, and an isolated fake-SFTP edit-session test harness.

Detailed scope lives in `docs/dev/V2.6_PLAN.md`.

### Included in v1.0.0: V1.9 Reliability

- Release reliability work: expanded release checklist for version bump, changelog, smoke, git tag, dmg/zip, and GitHub Release artifacts.
- Preferences includes Diagnostics controls to copy a redacted diagnostics bundle, open the log folder/file, and check the current update policy.
- First-run onboarding clarifies SFTP password saving, rsync BatchMode SSH requirements, and `safeStorage` behavior.
- Auto-update is documented as a manual GitHub Releases policy for now; silent install is deferred until Developer ID signing and notarization are configured.

### Implemented in V2.0 / v1.0.0

- Stable personal release: V12 remains default, core UX/transfer/preferences/security/release documentation are aligned with implemented behavior.
- V2.0 explicitly cuts full auto-update install, App Store distribution, remote edit auto-sync, and cross-platform support.
- Release docs treat signing/notarization honesty, diagnostics redaction, and manual smoke as release requirements.

### Included in v1.0.0: V1.8 Remote Operations

- Remote mkdir with main-process validation and refresh.
- Basic remote chmod via three-digit octal mode.
- Remote file duplicate for files up to 50 MB, using SFTP get/put in main process.
- Local "Open Terminal Here" and remote "Open SSH Terminal Here"; SSH terminal commands never include saved passwords.
- Remote symlink display from SFTP listing/stat where available.
- Remote directory size is calculated asynchronously with cancel support and traversal caps.

### Remote Capabilities Matrix

| Capability | Local | Remote |
| --- | --- | --- |
| Browse / sort / filter | Yes | Yes |
| Rename / delete / Get Info | Yes | Yes |
| New folder | Yes | Yes |
| Permissions | Read/display | Basic octal chmod |
| Duplicate | Deferred | Files up to 50 MB |
| Terminal here | Terminal.app | SSH Terminal.app, password not injected |
| Directory size | Async | Async, capped, cancelable |

### Included in v1.0.0: V1.7 Navigation

- Quick filter for the current local or remote directory listing by deterministic name substring.
- Path autocomplete from local recents/favorites and remote current-tab/per-profile visited paths; it does not crawl the filesystem or make extra SFTP list calls.
- Local recent locations and per-profile remote recent locations with clear-history controls.
- Per-pane history dropdowns in addition to Back/Forward buttons, preserving tab isolation.
- Navigation model boundary: favorites are intentional pinned shortcuts, recents are transient renderer history, and Site Manager profiles remain connection records.

### Included in v1.0.0: V1.6 Preferences

- Preferences MVP with versioned `settings.json` under the app userData directory.
- General preferences: default local starting path, delete confirmation, hidden file visibility, and restore-last-local-path behavior.
- Transfer preferences: default conflict policy, queue auto-hide delay, and rsync timestamp preservation.
- Appearance preferences: compact/comfortable rows, default inspector visibility, default pane ratio, and sidebar visibility.
- In-app shortcut reference for the active keyboard bindings.

### Included in v1.0.0: V1.5 Drag-and-Drop

- Drag selected files/folders between panes to upload or download through the existing V1.4 conflict-safe transfer path.
- Drag files/folders from Finder into the remote pane to upload.
- Drop feedback for valid directory/current-folder targets and invalid targets.
- Marquee selection from pane background, with additive selection when using `Cmd` or `Shift`.

### Implemented in V1.4 / v0.5.0

- Transfer safety: upload/download conflict detection before enqueue, with user-selected overwrite, skip, rename/keep-both, or cancel behavior.
- Queue recovery: retry individual failed transfers or retry all failed transfers while preserving source, destination, tab, direction, and connection metadata.
- Stable transfer failure categories for rsync missing, SSH BatchMode failure, permission denied, path not found, no space left, remote disconnect, and unknown errors; failed queue items can copy diagnostic detail.

### Implemented in V1.3 / v0.4.0

- Interaction efficiency: keyboard shortcuts, resizable panes, tab reorder, local/remote favorites polish.
- Limited read-only remote preview cache for sniffed text/images. This is not remote editing and does not sync local cached changes back to the server.

## Transfer Model

- Remote browse uses SFTP password auth.
- rsync upload/download currently requires SSH key or passwordless SSH (BatchMode).
- Existing transfer targets are checked before enqueue; overwrite/skip/rename/cancel choices are validated again in the main process.
- CoFinder does **not** use `sshpass` and does not pass saved password to rsync.

## Security Notes

- `profiles.json` stores non-sensitive profile fields only.
- `settings.json` stores non-secret UI/behavior preferences only.
- Saved password is kept separately in `credentials.enc.json` using `safeStorage` encryption.
- Password is not stored in transfer task payloads, renderer persisted state, or rsync args.

## Prerequisites

- macOS
- Node.js (LTS recommended)
- npm
- `ssh` available in system PATH
- `rsync` available in system PATH

## Development

```bash
npm install
npm run dev
```

## Test and Build

```bash
npm test
npm run test:unit
npm run build
```

## Packaging

```bash
npm run package   # unpacked mac app bundle (--dir)
npm run dist      # dmg + zip
```

Build artifacts are generated under `release/`.

## Release and Updates

- Development milestones are committed on `dev`; a version becomes shipped after the matching git tag and release artifacts are published.
- Current update policy is manual: users install dmg/zip artifacts from GitHub Releases or local release output. In-app auto-install is not enabled yet.
- Public distribution needs an Apple Developer ID certificate and notarization. Local personal builds may be unsigned, but unsigned artifacts should be described honestly in release notes.
- `v1.6.0` is the current development release target. Build artifacts use `release/CoFinder-1.6.0-arm64.dmg` and `release/CoFinder-1.6.0-arm64.zip` when `npm run dist` is executed.

**App icons:** `assets/icon/icon.icns` is used for the packaged `.app` / `.dmg` / `.zip` (see `electron-builder.yml`). `assets/icon/icon.png` is copied into `Resources` for `BrowserWindow` (`src/main/main.ts`). To regenerate both from the archived source PNG on macOS: `./scripts/gen-mac-app-icons.sh` (uses `sips` + `iconutil`, no extra npm deps).

Production renderer uses **relative asset URLs** (`vite` `base: './'`) so `loadFile()` from inside `app.asar` resolves JS/CSS correctly (avoids packaged white screen from `/assets/...` on `file://`).

## Troubleshooting

- **Electron failed to install correctly**
  - Remove `node_modules` and reinstall: `npm install`.
  - Check Node version compatibility with current Electron.
- **npm install hangs or stalls**
  - Check proxy/network config and retry in a clean network environment.
- **rsync not found**
  - Ensure `rsync` is installed and available in PATH.
  - CoFinder injects a fallback PATH for packaged app: `/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin`.
- **SSH key/passwordless login required**
  - rsync transfer precheck runs `ssh -o BatchMode=yes`; password-only SSH login for rsync is not supported in V1.
- **SFTP connects but rsync fails**
  - SFTP and rsync auth paths differ; verify terminal `ssh -o BatchMode=yes -p <port> user@host true` works first.
- **safeStorage unavailable**
  - Password-saving is disabled; connect still works with session password input.
- **Packaged app blank / DevTools shows `ERR_FILE_NOT_FOUND` for `/assets/...`**
  - Rebuild with current `vite.config.ts` (`base: './'`) and repackage; assets must be referenced as `./assets/...` under `file://`.
- **Main process log path**
  - `less "$HOME/Library/Application Support/CoFinder/main.log"` (quotes required because of the space in `Application Support`).
- **Diagnostics**
  - Preferences → Diagnostics can copy app version, platform, userData/log paths, and `ssh`/`rsync` availability. The bundle is redacted and does not include saved passwords, profile secrets, or private key contents.

## Project Structure

```text
src/
  main/      # Electron main process and services
  preload/   # contextBridge API surface
  renderer/  # React UI
  shared/    # Shared TypeScript models and IPC contracts
docs/
  smoke-test.md
  release-checklist.md
  security.md
  roadmap.md
```

## License

MIT
