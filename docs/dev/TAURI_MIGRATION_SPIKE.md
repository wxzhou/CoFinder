# Tauri Migration Spike (`opencode/tauri-spike`)

## Status

- **Branch:** `opencode/tauri-spike` (based on `dev`)
- **Goal:** replace the Electron shell with Tauri (Rust) while keeping the React renderer and the existing main-process services working, then move every service into Rust and remove the Node sidecar.
- **Result:** the entire backend is now native Rust. All 87 IPC channels are handled by `src-tauri/src/backend`; the Node sidecar is removed from runtime and packaging. The app bundle shrank from **~101 MB to ~11 MB**. Installable `CoFinder.app` + `CoFinder_1.9.10_aarch64.dmg` boot with window + WebKit render process. Not merged to `dev`.

## Architecture

```
renderer (React, window.cofinder bridge)
   │  invoke('cofinder_call', {channel, request}) / listen('cofinder:event')
   ▼
Tauri (Rust) shell + native Rust backend
   │  window/menu/content-window/native dialogs, dispatch for every channel
   ▼
   macOS app
```

- The **Rust backend** (`src-tauri/src/backend/`) implements every IPC channel: settings, local file ops, profiles + Keychain credentials, local sidebar favorites, system channels, the SFTP remote core (`remote.rs`, `russh`/`russh-sftp`), the transfer queue (`transfer.rs`, rsync fast path + SFTP fallback), remote edit/preview (`remote_edit.rs`), directory-size jobs, and content-window routing.
- The **renderer bridge** (`src/renderer/cofinderBridge.ts`) implements `window.cofinder` over `invoke`/`listen`, preserving the `{ ok, data } | { ok, error }` contract.
- `src/main/` TypeScript services remain as behavior reference and are covered by vitest specs; they are **not** packaged.

## Key file map

| Area | Files |
| --- | --- |
| Rust shell | `src-tauri/src/lib.rs`, `src-tauri/src/menu.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` |
| Rust backend | `src-tauri/src/backend/{mod,remote,remote_edit,transfer,local_files,profiles,favorites,settings,system,util,error}.rs` |
| Bridge | `src/renderer/cofinderBridge.ts`, `src/renderer/nativeDialogs.ts`, `src/renderer/main.tsx` |
| Packaging | `scripts/attach-cofinder-target.sh`, `.cargo/config.toml` |

## Behavior notes / deviations

- Existing Electron user data migrates: the backend reads `~/Library/Application Support/cofinder` (legacy Electron userData) when present, so profiles (host/user/port), settings, and sidebar favorites carry over. Saved passwords do not (Electron `safeStorage` uses a different key) and require one-time re-entry.
- `window.confirm` / `window.alert` use native macOS dialogs via `native_confirm` / `native_alert` commands.
- Saved-password encryption moved from Electron `safeStorage` to a Keychain-backed key (login Keychain preferred, 0600 key-file fallback).
- The title strip uses `data-tauri-drag-region`, restoring window dragging and macOS double-click-to-maximize that the Overlay title bar suppressed.
- `system:resume` (sleep/wake auto-refresh) is not wired; `powerMonitor` has no Tauri equivalent.
- Remote gzip percentage progress remains intentionally unsupported (unchanged decision).
- The transfer queue keeps the **rsync fast path** (`ssh -p PORT -o BatchMode=yes`) and falls back to recursive SFTP upload/download on ssh/rsync failures (exit 255, publickey/BatchMode, permission). Conflicts (upload/download), retry, cancel/stop, lane concurrency, and `transfer:onUpdate` push all work natively.
- The remote-edit watcher uses polling stat (instead of `fs.watch`) for the local cache copy; it is macOS-safe and syncs on size/mtime change.
- The Electron runtime and tooling have been removed (`electron`, `electron-builder`, `electronmon`, `wait-on`, `concurrently`; `src/main/main.ts`, `src/preload/`, `electron-builder.yml`, `scripts/build-sidecar-sea.mjs`).

## Build / target dir

Rust build artifacts are kept off the local disk on the flash card at
`/Volumes/SANDISK ELE/CoFinder-tauri-target/cofinder-target.sparseimage` (mounted at `/Volumes/CoFinderTarget`) via `.cargo/config.toml`. Run `scripts/attach-cofinder-target.sh` to mount after the card is reattached.

## Commands

```bash
npm run tauri:dev      # dev
npm run tauri:build    # release app + dmg
npm test && npm run typecheck && npm run check:secrets
cd src-tauri && cargo test
```

## Known risks / follow-ups

- The `russh`/`russh-sftp` port keeps a process-wide tokio runtime; blocking dispatch runs on `tauri::async_runtime::spawn_blocking` threads so remote calls never block the async worker pool. Host-key verification accepts any key (parity with the old `ssh2-sftp-client`). Public-key auth (`authType: privateKey` + `privateKeyPath`) is supported and live-verified against sge (10.0.32.10) and EP9 (10.0.42.9) read-only.
- Destructive remote/transfer write paths (delete, upload, download, chmod, gzip, copy/move) were validated by Rust unit tests and the TS specs, but not exercised against the live sge/EP9 servers (project policy allows read-only there).
- `src/main/` TS services and their vitest specs are intentionally kept as behavior reference; they can be removed later if desired.
