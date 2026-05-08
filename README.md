# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP. It focuses on stable dual-pane local/remote browsing plus rsync-based transfer queue workflows for personal daily use.

**`package.json` version:** `0.5.0` (development tree—for local **install/build/dist** testing). **Latest shipped release:** **v0.4.0** (tags, GitHub Release, user-facing “what’s out”).

## Versioning

CoFinder uses two parallel naming schemes:

- **Product milestone** (V1, V1.1, V1.2, …): labels for development phases and plan documents (`docs/dev/V1.*_PLAN.md`, `docs/roadmap.md`). They do **not** equal the numeric field in `package.json`.
- **Release version** (semver): what ships in **git tags**, **GitHub Releases**, and distributed macOS artifacts. During development, **`package.json` may be bumped ahead** (e.g. **0.5.0**) before that version is tagged—see **CHANGELOG.md** for what is actually **shipped**. Released versions are listed below.

Past releases are **not** retroactively re-tagged. Product milestone **V1.3** shipped as **`v0.4.0`**; **V1.4** is planned to ship as **`v0.5.0`** when ready.

| Product milestone | Release version / tag | Status |
| --- | --- | --- |
| V1 | v0.1.0 | Shipped |
| V1.1 | v0.2.0 | Shipped |
| V1.2 | v0.3.0 | Shipped |
| V1.3 | v0.4.0 | Shipped |
| V1.4 | v0.5.0 | Implemented in dev tree; not shipped until tagged |
| V1.5 | v0.6.0 | Planned |
| V1.6 | v0.7.0 | Planned |
| V1.7 | v0.8.0 | Planned |
| V1.8 | v0.9.0 | Planned |
| V1.9 | v0.10.0 | Planned |
| V2.0 | v1.0.0 | Planned stable release |

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

### Not Supported in V1-1.4

- Remote edit auto-sync workflow
- Full Quick Look for remote files
- Drag selection
- Drag-and-drop upload/download
- Full Preferences UI
- Full i18n

### Implemented in V1.4 / v0.5.0 development tree

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
