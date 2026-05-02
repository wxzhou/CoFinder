# CoFinder Release Checklist (V1.1 M6)

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
10. Trigger local file `Quick Look` from context menu and verify preview opens.
11. Trigger `Quick Look` in remote pane and verify explicit unsupported fallback message.
12. In local/remote tables, click blank area and verify selection clears.
13. Verify `Shift-click` selects only the anchor range (no out-of-range carryover).

## Data Hygiene

- Inspect `profiles.json`: no plaintext password fields.
- Inspect `credentials.enc.json`: no plaintext password values.
- Run:
  - `npm run check:secrets -- --user-data "$HOME/Library/Application Support/CoFinder"`

## Regression Gates (M6)

- `npm test` passes with selection and quick look regression coverage.
- `npm run build` passes without IPC contract regressions.
- `npm run package` completes and packaged app launches.
