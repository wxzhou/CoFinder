# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP. It focuses on stable dual-pane local/remote browsing plus rsync-based transfer queue workflows for personal daily use.

Current app version: `0.2.0`.

## V1 Status

- **V1 is complete.** Current milestone: **M5 completed (release hardening + packaging + documentation)**
- **V1.1 is complete.** Current milestone: **M6 completed (hardening + docs + release verification)**

### Implemented in V1.1 (ongoing)

- **M1 — rename (local + remote):**
  - Context menu `Rename` for local and remote file lists
  - In-place (inline) rename editing in the list row (no popup dialog)
  - Enter to submit, Escape to cancel, blur to submit
  - Finder/Explorer-style delayed second click on selected item to trigger inline rename
  - Main-process IPC + validation for `local:rename` and `remote:rename`
- **M2 — delete (local + remote):**
  - Context menu `Delete` for local and remote file lists
  - Supports single and multi-selection delete requests
  - Explicit confirmation dialog before destructive action
  - Main-process IPC + validation for `local:delete` and `remote:delete`
  - Local recursive delete + remote recursive delete with stable error mapping
- **M3 — properties / Get Info (local + remote):**
  - Context menu `Get Info` for local and remote file lists (single selection)
  - Read-only metadata dialog (name, full path, type, size, modified time, permissions, owner, group)
  - Human-readable permissions format (`rwxrwxrwx`) for local and remote entries
  - Robust remote type resolution (`file` / `directory` / `symlink`) from varied SFTP `stat` responses
  - For directories, dialog opens immediately and size is calculated asynchronously with a loading spinner
- **M4 — macOS-style UI polish A:**
  - Clear active pane visual highlight for keyboard-selection context
  - Stronger row selection contrast while preserving current selection behavior
  - Improved transfer queue status readability with status chips
  - Improved context menu spacing/readability (no behavior changes)
- **M5 — Quick Look MVP:**
  - Context menu `Quick Look` action for local and remote panes
  - Local single-file preview via macOS Quick Look (`qlmanage -p`) through main-process IPC
  - Optional `Space` shortcut to trigger Quick Look for current local single selection
  - Explicit fallback message for remote Quick Look (not supported in M5)
- **M6 — hardening + docs + release verification:**
  - Regression hardening for selection behavior (blank-area clear selection + stable Shift range semantics)
  - Added focused regression tests for selection and quick look guardrails
  - Updated smoke and release checklists to match shipped V1.1 behavior
  - Completed full verification flow (`npm test`, `npm run build`, packaging checks)

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

## V1.2 shell (development)

The Finder-first V1.2 **production shell** (Milestone 1+) is behind a flag so V1.1 remains the default:

- **Query:** append `?ui=v12` to the renderer URL (e.g. `http://localhost:5173/?ui=v12` in dev).
- **Electron dev:** set `COFINDER_UI_V12=1` so the dev window opens with `?ui=v12`. This is separate from `COFINDER_V12_MOCKUP=1`, which still loads the static `?mockup=v12` mockup only.

Remove the flag to return to the classic UI.

### Not Supported in V1

- Remote edit auto-sync workflow
- Quick Look for remote files
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