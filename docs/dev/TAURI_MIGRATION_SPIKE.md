# Tauri Migration Spike (`opencode/tauri-spike`)

## Status

- **Branch:** `opencode/tauri-spike` (based on `dev`)
- **Goal:** replace the Electron shell with Tauri (Rust) while keeping the React renderer and the existing main-process services working, and produce an installable app.
- **Result:** installable `CoFinder.app` + `CoFinder_1.9.10_aarch64.dmg` boot with window + sidecar + WebKit render process; local services round-trip through the bridge. Not merged to `dev`.

## Architecture

```
renderer (React, window.cofinder bridge)
   │  invoke('cofinder_call', {channel, request}) / listen('cofinder:event')
   ▼
Tauri (Rust) shell  ──  spawns + relays JSON-lines over stdio  ──►  Node sidecar
   │  window/menu/content-window/native dialogs                     (existing services)
   ▼
   macOS app
```

- The **Node sidecar** runs the existing TypeScript main-process services (SFTP, rsync transfers, Jobs queue, remote edit, credentials, settings, profiles) with `src/main/sidecar/electronShim.ts` providing compatible `app` / `ipcMain` / `BrowserWindow` / `clipboard` / `shell` / `safeStorage` implementations. In a real Electron runtime the shim re-exports the real module, so the classic Electron dev flow is preserved.
- The **Rust shell** (`src-tauri/`) owns windows (main + content), the native menu, native confirm/alert dialogs, the sidecar process, and IPC relay. `src/main/sidecar/index.ts` is the sidecar entry.
- The **renderer bridge** (`src/renderer/cofinderBridge.ts`) implements `window.cofinder` over `invoke`/`listen`, preserving the `{ ok, data } | { ok, error }` contract.

## Key file map

| Area | Files |
| --- | --- |
| Rust shell | `src-tauri/src/lib.rs`, `src-tauri/src/menu.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` |
| Sidecar | `src/main/sidecar/index.ts`, `src/main/sidecar/electronShim.ts` |
| Bridge | `src/renderer/cofinderBridge.ts`, `src/renderer/nativeDialogs.ts`, `src/renderer/main.tsx` |
| Packaging | `scripts/build-sidecar-sea.mjs`, `scripts/attach-cofinder-target.sh`, `.cargo/config.toml` |

## Behavior notes / deviations

- `window.confirm` / `window.alert` use native macOS dialogs via `native_confirm` / `native_alert` commands (WKWebView does not implement those JS dialogs); the 13 renderer call sites were converted to `await confirmDialog` / `await alertDialog`.
- Saved-password encryption moved from Electron `safeStorage` to a Keychain-backed key (login Keychain preferred, 0600 key-file fallback). Previously saved Electron credentials are not decryptable and must be re-saved.
- `system:resume` (sleep/wake auto-refresh) is not wired; `powerMonitor` has no Tauri equivalent in this spike.
- Remote gzip percentage progress remains intentionally unsupported (unchanged decision).

## Build / target dir

Rust build artifacts are kept off the local disk on the flash card at
`/Volumes/SANDISK ELE/CoFinder-tauri-target/cofinder-target.sparseimage` (mounted at `/Volumes/CoFinderTarget`) via `.cargo/config.toml`. Run `scripts/attach-cofinder-target.sh` to mount after the card is reattached.

## Commands

```bash
npm run tauri:dev      # dev
npm run tauri:build    # release app + dmg
npm test && npm run typecheck && npm run check:secrets
```

## Known risks / follow-ups

- Sidecar keeps the Node runtime (~90 MB SEA binary). Decide whether to keep the sidecar long-term or progressively port services to Rust (`russh`/`ssh2` crate for SFTP, native queue, etc.).
- `main.ts` (legacy Electron bootstrap) and `preload/index.ts` remain for reference; cleanup can follow once the spike is accepted.
- SFTP/rsync remote flows reuse proven service code but were not exercised against a live server in this spike.
