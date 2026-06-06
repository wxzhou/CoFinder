# CoFinder

CoFinder is a macOS-only Electron file manager inspired by WinSCP. It provides a Finder-like dual-pane interface for local and SFTP remote browsing, rsync-based transfers, remote text editing, and personal daily file-management workflows.

Current development version: **v1.9.1** (`package.json` version `1.9.1`). Latest published release: **v1.9.0**.

## Current Capabilities

- Dual-pane local / remote browsing with tabs, sorting, filtering, breadcrumbs, history, recents, and favorites.
- SFTP connection profiles, optional password saving through Electron `safeStorage`, and per-profile remote favorites.
- Unified Jobs pane for rsync upload/download plus delete, compress/decompress, and MD5 work, with conflict handling, retry, progress/status, folder-upload file detail, and drag-and-drop between panes.
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
npm run dev
```

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
npm run package   # unpacked macOS app bundle
npm run dist      # dmg + zip
```

Build artifacts are generated under `release/`. For v1.9.0, expected artifact names are `CoFinder-1.9.0-arm64.dmg` and `CoFinder-1.9.0-arm64.zip`.

Local builds may be unsigned. Public distribution should state signing/notarization status honestly.

## Security and Data

- `profiles.json` stores non-sensitive profile fields.
- `settings.json` stores non-secret UI and behavior preferences.
- Saved passwords are stored separately through Electron `safeStorage` in `credentials.enc.json` when available.
- Transfer tasks, renderer state, logs, diagnostics, and rsync args must not contain plaintext saved passwords.
- Preferences -> Diagnostics can copy a redacted diagnostic bundle and open app log locations.

More detail: [docs/security.md](docs/security.md).

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — semver release history.
- [docs/roadmap.md](docs/roadmap.md) — milestone themes and future boundaries.
- [docs/smoke-test.md](docs/smoke-test.md) — manual release-candidate checks.
- [docs/release-checklist.md](docs/release-checklist.md) — release process.
- [docs/dev/DEVELOPMENT_RULES.md](docs/dev/DEVELOPMENT_RULES.md) — development constraints.

## Project Structure

```text
src/
  main/      Electron main process and services
  preload/   contextBridge API surface
  renderer/  React UI
  shared/    shared models and IPC contracts
docs/
  dev/       milestone plans and development notes
```

## Troubleshooting

- **rsync not found:** install rsync and make sure it is in `PATH`. Packaged builds add a fallback PATH including `/opt/homebrew/bin` and `/usr/local/bin`.
- **SFTP connects but rsync cannot authenticate:** verify `ssh -o BatchMode=yes -p <port> user@host true` works in Terminal if you want the faster rsync path. Uploads and downloads fall back to SFTP when this non-interactive rsync SSH path cannot authenticate.
- **safeStorage unavailable:** password saving is disabled, but session password input can still connect.
- **Packaged app blank:** rebuild with the current Vite config (`base: './'`) and repackage.
- **Main log:** `~/Library/Application Support/CoFinder/main.log`.

## License

MIT
