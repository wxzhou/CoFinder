# CoFinder Release Checklist

## Preflight

- `npm test`
- `npm run build`
- `npm run package`
- `npm run dist`

## V1.2 v12 shell (required)

- Confirm **default UI is V1.2** (open packaged app with no env/query overrides → Finder shell / `AppShellV12`).
- Run the **V1.2** subsection of `docs/smoke-test.md` on that default build.
- With **legacy** (`COFINDER_LEGACY_UI=1` or `?ui=v11`), confirm classic layout still works and **V1.1 baseline** smoke sections pass.
- Confirm v12-scoped styles stay under `.cfv12-root` / v12 class prefixes where intended.

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

## Regression gates

- `npm test` passes (selection, Quick Look guards, v12 helpers as applicable).
- `npm run build` passes without IPC contract regressions.
- `npm run package` completes and packaged app launches.

## V1.3 v0.4.0 gates

- `npm run typecheck`
- Shortcut smoke subset from `docs/smoke-test.md`.
- V12 pane splitter persistence and reset.
- Tab drag reorder.
- Local and remote favorites add / reorder / remove.
- Remote read-only preview cache for sniffed text and images; verify cleanup on disconnect, tab close, and quit.

## V1.4 v0.5.0 gates

- `npm run typecheck`
- Transfer conflict smoke subset from `docs/smoke-test.md`: upload/download overwrite, skip, rename/keep-both, and cancel.
- Directory conflict smoke for at least one upload or download path.
- Retry one failed task and retry all failed tasks; confirm the queue remains serial.
- Failed task copy-error action; confirm copied detail includes stable code/message and no credentials.

## V1.5 v0.6.0 gates

- `npm run typecheck`
- Drag local selected file(s)/folder(s) to remote pane and confirm upload queues through the conflict dialog when needed.
- Drag remote selected file(s)/folder(s) to local pane and confirm download queues through the conflict dialog when needed.
- Drag Finder file/folder to remote pane and confirm upload; drag Finder item to local pane and confirm no transfer.
- Verify valid directory/current-folder drop feedback and invalid file-row drop feedback.
- Verify marquee replace and `Cmd`/`Shift` additive marquee selection.

## V1.6 v0.7.0 gates

- `npm run typecheck`
- Preferences open from classic top bar and V12 toolbar.
- Change default local path, restart dev session, and confirm the first tab opens there.
- Enable restore last session, navigate the active local pane, restart, and confirm only the local path is restored; remote connections are not auto-restored.
- Toggle show hidden files and confirm dotfiles appear/disappear without changing the underlying directory.
- Set default conflict policy to rename/skip/overwrite and confirm transfers use it without prompting; reset to prompt afterwards.
- Set queue auto-hide delay to a short value and confirm successful transfers hide after that delay.
- Toggle preserve timestamps and confirm rsync args use archive mode when enabled and recursive mode without timestamp preservation when disabled.
- Toggle compact row density, default inspector visibility, default pane ratio, and sidebar visibility; restart and confirm persisted settings apply.
- Inspect `settings.json` and confirm it contains no passwords, tokens, private keys, or rsync secrets.
