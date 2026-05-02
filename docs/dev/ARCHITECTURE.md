# CoFinder Architecture (Code-Aligned)

## Runtime Layers

- `main` layer: privileged operations (filesystem, SFTP, process spawn, clipboard).
- `preload` layer: typed bridge exposing `window.cofinder`.
- `renderer` layer: React UI and tab/pane state orchestration.
- `shared` layer: models and IPC contracts used by both sides.

## End-to-End Flow

1. UI action occurs in `src/renderer/App.tsx`.
2. Renderer calls `window.cofinder.*` (preload API).
3. `src/preload/index.ts` maps call to `ipcRenderer.invoke(...)`.
4. Main process handler in `src/main/ipc/registerIpcHandlers.ts` validates input via `ipcUtils`.
5. Handler calls service layer (`LocalFileService`, `RemoteFileService`, `TransferQueueService`, profile/credential services).
6. Handler returns unified `IpcResponse`.
7. Renderer updates tab state or queue state based on response.

## IPC Surface (Current)

- Local:
  - `local:listDirectory`
  - `local:openPath`
  - `local:revealPath`
  - `local:getHomePath`
- Remote:
  - `remote:connect`
  - `remote:listDirectory`
  - `remote:disconnect`
  - `remote:getHomeDirectory`
- Transfer:
  - `transfer:enqueueUpload`
  - `transfer:enqueueDownload`
  - `transfer:cancel`
  - `transfer:stop`
  - `transfer:list`
  - `transfer:clearCompleted`
  - push: `transfer:onUpdate`
- Profiles/Credentials:
  - `profiles:list`, `profiles:save`, `profiles:update`, `profiles:delete`
  - `credentials:isAvailable`
- System:
  - `system:copyText`

## Service Responsibilities

- `LocalFileService`
  - Local directory listing, open, reveal.
  - Local path normalization and fs error mapping.
- `RemoteFileService`
  - SFTP connect/list/disconnect/home.
  - Remote path normalization and remote error mapping.
- `ConnectionManager`
  - Holds active SFTP client connections keyed by `connectionId`.
- `TransferQueueService`
  - Global serial queue state machine.
  - rsync/ssh precheck and spawn.
  - task lifecycle (`pending/running/success/failed/canceled/stopped`).
  - update event fanout.
- `ProfileRepository`
  - Non-sensitive profile persistence.
- `SafeStorageCredentialProvider` + `CredentialService`
  - Encrypted credential persistence with availability check.

## State Model

- Renderer tab state:
  - each tab has independent local pane and remote pane.
  - each pane tracks path/history/sort/selection/error/loading.
- Transfer queue:
  - global in main process, not per tab.
  - each task binds to `tabId` for UI context.

## Validation and Error Contract

- Main process validates all critical fields (`id`, `path`, `port`, host/username, transfer arrays).
- Standard return:
  - success: `{ ok: true, data }`
  - failure: `{ ok: false, error: { code, message, detail? } }`
- Renderer consumes stable error payloads; no raw `Error` object assumptions.

## Security Model in Architecture

- Credentials never embedded in `ServerProfile`.
- Password should not be logged, serialized in transfer tasks, or passed via rsync args.
- Clipboard write goes through explicit `system:copyText`.
- Path safety and rsync safety checks centralized in main utilities/services.

## Lifecycle and Cleanup

- Main bootstraps window and diagnostics in `src/main/main.ts`.
- App quit calls `shutdownMainProcessResources()`:
  - unsubscribe transfer listener
  - remove registered IPC handlers
  - shutdown transfer queue
  - disconnect all SFTP connections

## V1.1 Tension Points (Must Account For)

- Rename/delete/properties require both local and remote operation parity but current services have asymmetry.
- Renderer has a large single container (`App.tsx`), so incremental extraction is safer than broad UI refactor.
- Remote operations currently focus on browse/connect; destructive commands must add strict guardrails and explicit confirmations.

