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

## IPC details and main logs

- IPC failure payloads still use `{ ok, error }`; **`error.detail`** is length-limited and passed through a minimal scrubber for patterns such as `password`, `passphrase`, `privateKey`, and `token`.
- Main-process diagnostic logs that attach structured payloads run those objects through the same **key-based redaction** before `JSON.stringify` (console + `main.log`).

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

## Removing Saved Data

- Delete profile in Site Manager to remove profile + associated credential.
- Optional manual cleanup:
  - remove `profiles.json`
  - remove `credentials.enc.json`
