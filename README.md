# CoFinder

CoFinder is a macOS-only Electron file manager inspired by WinSCP. It provides a Finder-like dual-pane interface for local and SFTP remote browsing, rsync-based transfers, remote text editing, and personal daily file-management workflows.

Current development version: **v1.8.7** (`package.json` version `1.8.7`).

## Current Capabilities

- Dual-pane local / remote browsing with tabs, sorting, filtering, breadcrumbs, history, recents, and favorites.
- SFTP connection profiles, optional password saving through Electron `safeStorage`, and per-profile remote favorites.
- rsync upload/download queue with conflict handling, retry, progress/status, folder-upload file detail, and drag-and-drop between panes.
- Local and remote file operations: rename, delete, new folder, new text file, gzip single-file compression, basic metadata/Inspector, and selected remote operations such as octal chmod and small-file duplicate.
- Local Quick Look plus read-only remote preview / Quick Look for sniffed text and image files.
- Remote text edit workflow: edit sniffed remote text files in a configured local editor, watch saves, upload back, and surface conflicts safely.
- Pane-scoped V12 UI with compact toolbars, breadcrumb copy buttons, resizable sidebar/panes, Inspector, transfer drawer, remote auto-refresh preference, diagnostics, and macOS menu integration.

## Scope

CoFinder is intentionally personal and macOS-only. It is not currently a cross-platform file manager, a full remote shell/ACL manager, a general indexed search tool, or an App Store/notarized distribution.

Remote editing is intentionally scoped to text files. Binary/document edit auto-sync is not supported.

## Versioning

The project uses two names:

- **Product milestones** (`V2.8`, `V2.8.1`, etc.) describe planning and development scope.
- **Release versions** (`v1.8.7`, etc.) are semver versions used by `package.json`, tags, GitHub Releases, and build artifacts.

The full history lives in [CHANGELOG.md](CHANGELOG.md). The high-level roadmap lives in [docs/roadmap.md](docs/roadmap.md).

## Prerequisites

- macOS
- Node.js LTS and npm
- `ssh` in `PATH`
- `rsync` in `PATH`

Remote browsing uses SFTP password authentication. Transfers use rsync over SSH and currently require SSH key or passwordless SSH (`BatchMode`) for the transfer path. CoFinder does not use `sshpass` and does not pass saved passwords to rsync.

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

Build artifacts are generated under `release/`. For v1.8.7, expected artifact names are `CoFinder-1.8.7-arm64.dmg` and `CoFinder-1.8.7-arm64.zip`.

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
- **SFTP connects but rsync transfer fails:** verify `ssh -o BatchMode=yes -p <port> user@host true` works in Terminal.
- **safeStorage unavailable:** password saving is disabled, but session password input can still connect.
- **Packaged app blank:** rebuild with the current Vite config (`base: './'`) and repackage.
- **Main log:** `~/Library/Application Support/CoFinder/main.log`.

## License

MIT
