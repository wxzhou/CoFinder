# CoFinder

CoFinder is a macOS-only Tauri file manager inspired by WinSCP. It provides a Finder-like dual-pane interface for local and SFTP remote browsing, rsync-based transfers, remote text editing, and personal daily file-management workflows. The React renderer and the Node main-process services from the original Electron build are preserved; Electron is replaced by a Tauri (Rust) shell that runs the services as a bundled Node sidecar.

Current development version: **v1.9.10** (`package.json` version `1.9.10`). Latest published release: **v1.9.0**.

## Current Capabilities

- Dual-pane local / remote browsing with tabs, list/icon/column/gallery views, sorting, filtering, always-on expandable list rows, breadcrumbs, history, recents, and favorites.
- SFTP connection profiles, optional password saving through a Keychain-backed credential service, and per-profile remote favorites.
- Unified Jobs pane for rsync upload/download plus delete, compress/decompress, MD5, and remote copy/move work, with conflict handling, retry, progress/status, folder-upload file detail, drag-and-drop between panes, and lane-aware scheduling.
- Local and remote file operations: rename, delete, new folder, new text file, touch, change timestamp, file/folder compression and decompression, MD5 sidecar generation, basic metadata/Inspector, and selected remote operations such as chmod and small-file duplicate.
- Local Quick Look for local files.
- Remote local-copy workflow: open remote files with the default macOS app or a configured text editor, watch local saves, upload back, and surface conflicts safely. Text-editor opens are optimized for sniffed text and require confirmation before forcing binary files; default-app opens warn for large/executable files.
- Pane-scoped V12 UI with compact toolbars, breadcrumb copy buttons, resizable sidebar/panes, Inspector, Jobs pane, remote auto-refresh preference, diagnostics, and macOS menu integration.

## Scope

CoFinder is intentionally personal and macOS-only. It is not currently a cross-platform file manager, a full remote shell/ACL manager, a general indexed search tool, or an App Store/notarized distribution.

Remote editing uses app-managed local copies. Text-editor edits are optimized for text files, while default-app remote Open can handle broader file types after downloading them locally and watching for saves.

## Versioning

The project uses two names:

- **Product milestones** (`V2.8`, `V2.8.1`, etc.) describe planning and development scope.
- **Release versions** (`v1.9.0`, etc.) are semver versions used by `package.json`, tags, GitHub Releases, and build artifacts.

The full history lives in [CHANGELOG.md](CHANGELOG.md). The high-level roadmap lives in [docs/roadmap.md](docs/roadmap.md).

## Prerequisites

- macOS
- Node.js LTS and npm
- `ssh` in `PATH`
- `rsync` in `PATH`

Remote browsing uses SFTP password authentication. Transfers use rsync over SSH first. If an upload or download cannot start because the rsync SSH channel requires passwordless login, CoFinder falls back to the active SFTP connection for that transfer. CoFinder does not use `sshpass` and does not pass saved passwords to rsync.

## Development

```bash
npm install
npm run build:sidecar   # compiles the TypeScript services + electron shim
npm run tauri:dev       # vite dev server + `tauri dev`
```

The Tauri shell spawns the Node sidecar (`dist-electron/main/sidecar/index.js` in dev, a bundled SEA executable in release) and bridges the renderer to it. Build artifacts (Rust `target/`) are kept on an external flash card via `.cargo/config.toml`; run `scripts/attach-cofinder-target.sh` to mount the APFS sparse image if cargo reports a missing target dir.

Default UI is the V12 production shell. Legacy classic UI is still available for comparison with `?ui=v11`, `?legacy=1`, `COFINDER_LEGACY_UI=1`, or `VITE_COFINDER_LEGACY_UI=1`.

## Test and Build

```bash
npm test
npm run build
```

Useful focused commands:

```bash
npm run test:unit
npm run typecheck
npm run check:secrets
```

## Packaging

```bash
npm run tauri:build      # renderer build + sidecar SEA + `tauri build`
```

Build artifacts are generated under the flash-card target dir:
`/Volumes/CoFinderTarget/target/release/bundle/` (`CoFinder.app` and `CoFinder_1.9.10_aarch64.dmg`).

The Electron runtime and packaging tooling (electron, electron-builder, electronmon, wait-on, concurrently) have been removed; `tauri:build` is the only packaging path.

Local builds may be unsigned. Public distribution should state signing/notarization status honestly.

## Security and Data

- `profiles.json` stores non-sensitive profile fields.
- `settings.json` stores non-secret UI and behavior preferences.
- Saved passwords are stored separately through a Keychain-backed credential service in `credentials.enc.json` (key in the macOS login Keychain).
- Transfer tasks, renderer state, logs, diagnostics, and rsync args must not contain plaintext saved passwords.
- Preferences -> Diagnostics can copy a redacted diagnostic bundle and open app log locations.

More detail: [docs/security.md](docs/security.md).

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — semver release history.
- [docs/roadmap.md](docs/roadmap.md) — milestone themes and future boundaries.
- [docs/smoke-test.md](docs/smoke-test.md) — manual release-candidate checks.
- [docs/release-checklist.md](docs/release-checklist.md) — release process.
- [AGENTS.md](AGENTS.md) — coding-agent development rules.
- [docs/dev/DEVELOPMENT_RULES.md](docs/dev/DEVELOPMENT_RULES.md) — historical development constraints.

## Project Structure

```text
src/
  main/      main-process services (run as a Node sidecar under Tauri)
  preload/   legacy Electron preload (kept for reference)
  renderer/  React UI (window.cofinder bridge in cofinderBridge.ts)
  shared/    shared models and IPC contracts
src-tauri/   Tauri (Rust) shell: window, menu, sidecar spawn, IPC relay
docs/
  dev/       milestone plans and development notes
```

## Troubleshooting

- **rsync not found:** install rsync and make sure it is in `PATH`. Packaged builds add a fallback PATH including `/opt/homebrew/bin` and `/usr/local/bin`.
- **SFTP connects but rsync cannot authenticate:** verify `ssh -o BatchMode=yes -p <port> user@host true` works in Terminal if you want the faster rsync path. Uploads and downloads fall back to SFTP when this non-interactive rsync SSH path cannot authenticate.
- **Credential storage unavailable:** password saving is disabled, but session password input can still connect.
- **Packaged app blank:** rebuild with the current Vite config (`base: './'`) and repackage.
- **Sidecar not running / requests time out:** confirm `node` is on `PATH` in dev, and that the packaged `cofinder-sidecar` binary exists next to the app executable (`CoFinder.app/Contents/MacOS/cofinder-sidecar`).
- **Cargo target dir missing:** run `scripts/attach-cofinder-target.sh` to mount the build-target sparse image from the flash card.
- **Main log:** `~/Library/Application Support/cofinder/main.log` (sidecar boot log); renderer console is visible via the View → Toggle Developer Tools menu.

## License

MIT
