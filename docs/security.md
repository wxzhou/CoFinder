# Security Model

## Profile and Credential Separation

- Site profiles are stored in `profiles.json`.
- Profiles include host/port/username and related metadata only.
- Password is never persisted in profile records.

## Credential Storage

- Saved password uses Electron `safeStorage` encryption.
- Encrypted secrets are stored in `credentials.enc.json`.
- If `safeStorage` is unavailable, password saving is disabled.

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
