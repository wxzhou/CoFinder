# CoFinder Release Checklist (M5)

## Preflight

- `npm test`
- `npm run build`
- `npm run package`
- `npm run dist`

## Packaged App Smoke

1. Launch packaged app from `release/`.
2. Verify local pane can browse directories.
3. Open `Connect...` and enter Site Manager.
4. Select saved profile and login.
5. Browse remote directory.
6. Upload one small local file.
7. Download one small remote file.
8. Quit app.
9. Verify no orphan `rsync`/`ssh` process remains.

## Data Hygiene

- Inspect `profiles.json`: no plaintext password fields.
- Inspect `credentials.enc.json`: no plaintext password values.
- Run:
  - `npm run check:secrets -- --user-data "$HOME/Library/Application Support/CoFinder"`
