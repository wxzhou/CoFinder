# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP, focused on stable dual-pane local/remote file browsing and rsync-based transfers.

## Status

- Current milestone: **M3.5 completed (Site Manager / Login Manager + profile credential management)**
- Implemented in M0:
  - Electron + Vite + React + TypeScript scaffold
  - main / preload / renderer separation
  - Security defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
  - Base layout and IPC/service skeleton
- Implemented in M1:
  - Local directory listing via main-process IPC (`local:listDirectory`)
  - Local file open via main-process IPC (`local:openPath`)
  - Path navigation: Enter to jump, Back/Forward, Up, Home, Refresh
  - Sorting: name/size/mtime, asc/desc, directories-first
  - Single selection + status bar stats (selected/total count and size)
  - Error handling for not found / permission denied / not a directory / open failed
  - Local pane usability fixes: long filename ellipsis + fixed bottom status bar
- Implemented in M1.5 / M1.6 (UI foundation and queue behavior):
  - Unified renderer design tokens (color/spacing/radius/control/table/status sizing)
  - Split-workspace visual cleanup for left/right panes
  - Local toolbar and path bar polish (compact desktop-like controls)
  - File list visual polish (lighter separators, tighter row rhythm, subtle hover/selection)
  - File-kind leading marker in name column (placeholder icon slot)
  - Directory size display as `—` in local list
  - Productized right pane empty state (`Not connected` + disabled `Connect...` placeholder)
  - Transfer Queue UI state model and behavior:
    - hidden (default when no tasks)
    - expanded
    - collapsed
    - auto-hide pending (10s after all-success/no-failure when not pinned)
  - Dev-only queue debug seed controls moved out of default product UI
- Implemented in M2 (remote connection and browsing):
  - SFTP-based remote connect flow (`remote:connect`) with host/port/username/password form
  - Remote directory browsing via main-process service (`remote:listDirectory`)
  - Remote pane navigation: path input, Back/Forward, Up, Home, Refresh
  - Remote file table sorting (name/size/mtime, directories-first)
  - Remote status bar (selected/total count and size)
  - Disconnect action (`remote:disconnect`) and clean reset to Not connected state
  - IPC response normalization (`ok/data` or `ok=false/error`)
  - Remote listDirectory reliability fix: treat `sftp.list(path)` success as browsable source of truth
  - Session-only password usage (no plaintext password persisted in profiles)
- Implemented in M3 (multi-tab session isolation):
  - Tab bar with add/switch/close support and per-tab title lifecycle
  - Independent local pane state per tab (path, history, sort, selection, errors)
  - Independent remote pane state per tab (connection/path/history/sort/selection/errors)
  - Connection isolation in main process via `Map<connectionId, client>` to prevent tab cross-talk
  - Async stale-result guards in renderer (`tabId` + `connectionId`) to avoid wrong-tab updates
  - Session-scoped remote state guards to avoid tab cross-contamination
  - App quit hardening: disconnect all active remote sessions on `before-quit`
- Implemented in M3.5 (Site Manager / Login Manager):
  - WinSCP-style Site Manager modal for saved-site list + profile editor + Login workflow
  - Saved profiles CRUD: list/save/update/delete/duplicate from modal
  - Unconnected remote pane restored to `Not connected` + `Connect...` entry point
  - Profile persistence in app userData (`profiles.json`) with non-sensitive fields only
  - Password persistence separated from profiles via credential service
  - Electron `safeStorage`-backed credential provider (`credentials.enc.json`) with availability guard
  - Save password option controlled per profile; stored password can be reused for Login
  - Deleting a profile also removes its associated saved credential
  - Authentication boundary hardening: password never persisted in profile payloads

## Tech Stack

- Electron
- React
- Vite
- TypeScript
- npm
- ssh2-sftp-client

## Development

### Prerequisites

- macOS
- Node.js (LTS recommended)
- npm

### Install

```bash
npm install
```

### Run (dev)

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Project Structure

```text
src/
  main/      # Electron main process and services
  preload/   # contextBridge API surface
  renderer/  # React UI
  shared/    # Shared TypeScript models and IPC contracts
```

## Security Baseline

- Renderer does not access Node APIs directly.
- `nodeIntegration` is disabled in renderer.
- Preload exposes a limited API through `contextBridge`.
- IPC channels are centralized in main process.

## Current Scope

- Implemented now:
  - Local pane functional flow (M1)
  - UI foundation + Transfer Queue display behavior (M1.5 / M1.6)
  - Remote connection and remote pane browsing (M2)
  - Multi-tab session model with isolated tab state (M3)
  - Site Manager / Login Manager with profile + credential management (M3.5)
- Not implemented yet:
  - Real rsync transfer execution pipeline (M4)

## Roadmap

- M4: Rsync transfer queue (serial execution, status, logs)
- M5: Polish, hardening, packaging

## License

MIT