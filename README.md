# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP, focused on stable dual-pane local/remote file browsing and rsync-based transfers.

## Status

- Current milestone: **M1 completed (local pane)**
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
  - UI fixes: long filename ellipsis + fixed bottom status bar

## Tech Stack

- Electron
- React
- Vite
- TypeScript
- npm

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

- Implemented: left local pane (M1)
- Not implemented yet: remote pane (M2), multi-tab state (M3), rsync transfer queue (M4)

## Roadmap

- M2: Remote SSH/SFTP connection and remote pane
- M3: Multi-tab session model with isolated tab state
- M4: Rsync transfer queue (serial execution, status, logs)
- M5: Polish, hardening, packaging

## License

MIT