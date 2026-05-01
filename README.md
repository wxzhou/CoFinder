# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP. It focuses on stable dual-pane local/remote browsing plus rsync-based transfer queue workflows for personal daily use.

## V1 Status

- **V1 is complete.** Current milestone: **M5 completed (release hardening + packaging + documentation)**

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

### Not Supported in V1

- Remote edit auto-sync workflow
- Quick Look for remote files
- Delete/rename operations
- Drag selection
- Drag-and-drop upload/download
- Full Preferences UI
- Full i18n

## Transfer Model

- Remote browse uses SFTP password auth.
- rsync upload/download currently requires SSH key or passwordless SSH (BatchMode).
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