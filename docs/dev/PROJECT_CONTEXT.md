# CoFinder Project Context (V1 Baseline)

## Purpose

CoFinder is a macOS-only Electron desktop app for dual-pane local/remote file browsing, with a WinSCP-like workflow and a global rsync transfer queue.

This document is the short-onboarding baseline for future V1.1 development. It is intentionally concrete and tied to the current codebase.

## Stack and Runtime

- Electron main process + preload bridge + React renderer.
- TypeScript across `src/main`, `src/preload`, `src/renderer`, `src/shared`.
- Vite for renderer build (`base: "./"` for packaged `file://` loading).
- Unit tests with Vitest in `tests/`.
- Packaging with `electron-builder` (`dmg` + `zip`).

## Current V1 Feature Baseline

- Local pane browse/open/reveal/sort/history.
- Remote pane SFTP connect/list/disconnect/history.
- Site Manager modal (profiles CRUD + login entry).
- Profile persistence in `profiles.json`; credentials in `credentials.enc.json`.
- v12 local sidebar favorites in `local-sidebar-favorites.json` under userData (`custom`, optional `hiddenDefaultIds`; `localFavorites:*` IPC).
- Multi-tab isolation for local/remote pane state.
- Global serial transfer queue (upload/download via `rsync`) with conflict detection, rename/skip/overwrite/cancel policy, retry, and stable failure categories.
- Multi-select (`Cmd`/`Shift` click + `Cmd/Ctrl+A`), marquee selection, drag-and-drop transfer, and context menus.
- IPC unified response shape: `{ ok: true, data }` or `{ ok: false, error }`.

## Core Source Map

- Main app bootstrap: `src/main/main.ts`
- IPC channel constants: `src/main/ipc/channels.ts`
- IPC handlers and lifecycle: `src/main/ipc/registerIpcHandlers.ts`
- IPC validation/error utilities: `src/main/ipc/ipcUtils.ts`
- Local FS service: `src/main/services/LocalFileService.ts`
- Remote SFTP service: `src/main/services/RemoteFileService.ts`
- Transfer queue service: `src/main/services/TransferQueueService.ts`
- Profile repository: `src/main/services/ProfileRepository.ts`
- Secure credential provider: `src/main/services/SafeStorageCredentialProvider.ts`
- Renderer app container: `src/renderer/App.tsx`
- Selection utilities: `src/renderer/selection.ts`
- Shared contracts: `src/shared/types/models.ts`, `src/shared/types/ipc.ts`
- Preload bridge: `src/preload/index.ts`

## Security and Data Boundaries

- `ServerProfile` has no password field persisted to disk.
- Password saving is available only when `safeStorage.isEncryptionAvailable()`.
- Transfer tasks/logs must not include plaintext password.
- rsync path/host validation is enforced in main process.
- Renderer must not receive raw exception stacks.

## Operational Invariants (Do Not Break)

- Tab isolation: closing/disconnecting one tab must not break others.
- Queue scope: queue is global; tasks carry `tabId`.
- Queue execution is serial, including retry/retry-all paths.
- Drag-and-drop transfer must route through the same enqueue/conflict pipeline as toolbar/context menu transfers.
- IPC input validation stays in main process (renderer is untrusted input).
- App quit must clean up: transfer queue shutdown and connection disconnect-all.
- Packaged app must resolve assets and tools (`PATH` augmentation for `ssh`/`rsync`).

## Known Design Constraints

- Remote browsing currently supports password auth for SFTP; private key auth is not enabled in V1 connect flow.
- rsync transfer requires non-interactive SSH (`BatchMode=yes`), not password prompt piping.
- `SettingsService` is minimal and not a full preferences subsystem yet.

## Quick Start for New Session

1. Read this file and `docs/dev/DEVELOPMENT_RULES.md`.
2. Read `docs/dev/V1.1_PLAN.md` and pick one milestone only.
3. Confirm affected boundaries in:
   - `src/main/ipc/registerIpcHandlers.ts`
   - service file(s) in `src/main/services/`
   - `src/shared/types/ipc.ts`
   - related renderer area in `src/renderer/App.tsx` or component files
4. Implement minimal change set (no unrelated refactor).
5. Run verification:
   - `npm test`
   - `npm run build`
   - targeted manual smoke from `docs/smoke-test.md`

## Out of Scope for This Document

- No V1.1 implementation details.
- No speculative architecture rewrite.
