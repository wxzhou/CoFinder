# CoFinder

CoFinder is a macOS-only Electron desktop app inspired by WinSCP, focused on stable dual-pane local/remote file browsing and rsync-based transfers.

## Status

- Current milestone: **M0 scaffold**
- Implemented in M0:
  - Electron + Vite + React + TypeScript project setup
  - Main / preload / renderer separation
  - Electron security defaults (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
  - Basic app window and shell layout
  - IPC channels and service skeletons
  - Build and dev scripts wired up

## Tech Stack

- Electron
- React
- Vite
- TypeScript
- npm

## Development

### Prerequisites

- Node.js (LTS recommended)
- npm
- macOS (this project targets macOS only)

### Install

```bash
npm install
```

## Project Structure (M0)

```
src/
    main/ # Electron main process
    preload/ # Context bridge API
    renderer/ # React UI
    shared/ # Shared types/contracts between processes
```

## Security Baseline

- Renderer does not directly access Node.js APIs.
- Node integration is disabled in renderer.
- Preload exposes a limited API surface through `contextBridge`.
- IPC channels are centralized for controlled main-process access.

## Roadmap

Planned milestones:

- M1: Local pane (list, sort, path navigation, context menu)
- M2: Remote SSH/SFTP connection and remote pane
- M3: Multi-tab session model with isolated tab state
- M4: Rsync transfer queue (serial execution, status, logs)
- M5: Polish, hardening, and macOS packaging

## License

MIT