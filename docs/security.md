# Security Model

## Profile and Credential Separation

- Site profiles are stored in `profiles.json`.
- Profiles include host/port/username and related metadata only.
- Password is never persisted in profile records.

## Credential Storage

- Saved password uses Electron `safeStorage` encryption.
- Encrypted secrets are stored in `credentials.enc.json`.
- If `safeStorage` is unavailable, password saving is disabled.
- On POSIX, `profiles.json` and `credentials.enc.json` are written via an atomic temp file with **mode 0o600**, then renamed and chmod’d to **0o600** (format unchanged—no migration).

## Settings Storage

- Preferences are stored in `settings.json` under Electron app userData.
- Settings are non-secret UI/behavior fields only: default local path, navigation restore toggles, confirmation/display toggles, transfer conflict defaults, queue auto-hide delay, timestamp preservation, remote refresh/reconnect toggles, row density, inspector visibility, pane ratio, sidebar visibility, and first-run onboarding dismissal.
- Settings must not store passwords, tokens, private keys, saved remote credentials, or free-form `rsync`/`ssh` arguments.

## Navigation History Storage

- V1.7 recent locations are stored in renderer localStorage as non-secret local paths and per-profile remote paths.
- Recent locations must not store passwords, tokens, private keys, saved credentials, or command arguments.
- Remote path autocomplete uses already-known paths only and does not crawl the server.

## Terminal Invocation Rules

- Local "Open Terminal Here" launches Terminal.app at a validated local path.
- Remote "Open SSH Terminal Here" launches Terminal.app with `ssh -p <port> <user>@<host>` and an optional remote `cd`.
- Saved passwords are never read for terminal launch and are never placed on command lines, shell scripts, environment variables, or logs.
- Host, username, port, and remote path are validated in main before terminal launch.

## IPC details and main logs

- IPC failure payloads still use `{ ok, error }`; **`error.detail`** is length-limited and passed through a minimal scrubber for patterns such as `password`, `passphrase`, `privateKey`, and `token`.
- Main-process diagnostic logs that attach structured payloads run those objects through the same **key-based redaction** before `JSON.stringify` (console + `main.log`).
- The diagnostics clipboard bundle includes app version, platform, architecture, userData/log paths, `ssh`/`rsync` availability, and update policy only. It must not include saved profiles, saved credentials, private key contents, transfer task payloads, or raw logs.
- Diagnostics text is passed through the plaintext redactor before it reaches the clipboard.

## rsync Password Policy

- CoFinder does not pass password to `rsync`.
- V1 rsync transfers require SSH key or passwordless SSH (BatchMode).
- `sshpass` is intentionally not used.

## Logging and Runtime State Rules

- Password is not allowed in:
  - transfer task payloads
  - transfer raw logs
  - renderer persisted state
  - user-facing error details

## Remote Preview Cache

- V1.3 remote preview is read-only from CoFinder's perspective.
- Supported remote files are downloaded to an app-managed local cache/temp folder before opening.
- CoFinder never uploads cached preview files back to the server and does not treat local viewer edits as remote edits.
- Cached preview files and their containing cache folder are marked read-only while exposed to the viewer. If a cached file is modified outside CoFinder anyway, CoFinder re-downloads from remote before reopening it.
- Cached files are kept while the tab/connection is alive for faster re-open, then removed on disconnect, tab close, or app quit.
- Cache metadata must not include passwords, tokens, or private keys.

## Removing Saved Data

- Delete profile in Site Manager to remove profile + associated credential.
- Optional manual cleanup:
  - remove `profiles.json`
  - remove `credentials.enc.json`
