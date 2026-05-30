# CoFinder Project Context (V1 Baseline)

## Purpose

CoFinder is a macOS-only Electron desktop app for dual-pane local/remote file browsing, with a WinSCP-like workflow and a global rsync transfer queue.

This document is the short-onboarding baseline for future post-V2.0 development. It is intentionally concrete and tied to the current codebase.

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
- Preferences MVP in `settings.json` under userData (`schemaVersion: 2`; non-secret general, transfer, appearance, and onboarding-dismissed preferences; `settings:get` / `settings:set` IPC).
- V1.7 navigation efficiency stores transient local and per-profile remote recents in renderer localStorage (`cofinder.recent.*`); these are non-secret paths and do not add IPC or main-process files.
- Multi-tab isolation for local/remote pane state.
- Unified Jobs pane with a currently serial main-process queue for upload/download plus delete/gzip work. Future multi-lane queue design is documented in `docs/dev/V2.0.x_PARALLEL_JOBS_PLAN.md`.
- V1.8 remote operations: mkdir, basic chmod, file duplicate up to 50 MB, SSH Terminal here without password injection, and cancelable capped directory-size jobs.
- V1.9 reliability work: Diagnostics actions in Preferences, first-run onboarding, release checklist hardening, and manual GitHub Releases update policy.
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
- Diagnostics service: `src/main/services/DiagnosticsService.ts`
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
- Future queue parallelism must use lane-specific concurrency and path locks; do not switch to unrestricted global parallel execution.
- Drag-and-drop transfer must route through the same enqueue/conflict pipeline as toolbar/context menu transfers.
- IPC input validation stays in main process (renderer is untrusted input).
- App quit must clean up: transfer queue shutdown and connection disconnect-all.
- Remote recursive operations must stay capped/cancelable and avoid following symlink cycles.
- Packaged app must resolve assets and tools (`PATH` augmentation for `ssh`/`rsync`).

## Known Design Constraints

- Remote browsing currently supports password auth for SFTP; private key auth is not enabled in V1 connect flow.
- rsync transfer requires non-interactive SSH (`BatchMode=yes`), not password prompt piping.
- Settings are intentionally curated. `SettingsService` owns schema normalization/migration boundaries; renderer never reads or writes `settings.json` directly.
- Diagnostics are intentionally narrow and redacted. They must not read saved profiles, credentials, private keys, raw transfer logs, or server-side files.
- Search/filter is not indexed search. It only narrows currently loaded entries by name; autocomplete uses known paths only and must not crawl remote servers.

## Quick Start for New Session

1. Read this file and `docs/dev/DEVELOPMENT_RULES.md`.
2. Read the active `docs/dev/V*_PLAN.md` for the requested milestone and pick one milestone only.
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

## Current Planned Work

- Latest implemented milestone: **V2.1 / v1.1.0**, tracked in `docs/dev/V2.1_PLAN.md`.
- V2.1 was driven by v1.0.0 feedback and prioritized transfer correctness, file-operation reliability, Inspector/Get Info consolidation, path/navigation polish, and macOS layout integration.

## Out of Scope for This Document

- No speculative architecture rewrite.
