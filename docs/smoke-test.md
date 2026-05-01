# CoFinder Smoke Test Checklist (M4.6)

Use this checklist before a release candidate. Prefer an isolated test workspace.

## Test Workspace

- Local test root: `~/CoFinderSmokeTest/local`
- Remote test root: `~/CoFinderSmokeTest/remote`
- Do not run smoke tests in production folders.

## Local Pane Smoke (M1)

- Launch app; confirm left pane loads a valid local directory.
- Enter a child directory, then test `Up`, `Back`, `Forward`, and `Refresh`.
- Change sort key (`name`, `size`, `mtime`) and verify order changes.
- Double-click a file and confirm OS open action works.

## Remote Pane Smoke (M2 + M3.5)

- Open `Connect...` and enter Site Manager.
- Select saved profile and login using saved password flow.
- Browse remote directories and test remote path input navigation.
- Try a non-existent remote path and verify current directory state remains usable.
- Disconnect and reconnect from Site Manager.

## Tabs Smoke (M3)

- Tab A: connect and navigate to path X.
- Tab B: connect and navigate to path Y.
- Switch A/B and verify local/remote path and sort state do not cross-contaminate.
- Close tab B and verify tab A connection remains usable.
- Attempt closing last tab and verify app keeps at least one active tab.

## Transfer Smoke (M4)

1. Create a small local text file in local test root.
2. Upload selected file to remote test root.
3. Refresh remote pane and confirm uploaded file appears.
4. Remove local copy (or switch local directory), then download from remote.
5. Refresh local pane and verify file appears.
6. Upload one directory and verify directory itself (not only children) appears remotely.
7. Queue 2+ transfers; verify serial execution (one running at a time).
8. Cancel a pending transfer.
9. Stop a running transfer using a larger file.
10. Confirm failed task keeps queue visible (no auto-hide).
11. Confirm all-success queue auto-hides after ~10s when not pinned.

## Multi-select + Context Menu Smoke (M4.6)

1. In local pane, use `Cmd-click` to select multiple items.
2. In local pane, use `Shift-click` from an anchor row to create a range selection.
3. Confirm local status bar selected count/size reflects multiple selected rows.
4. Right-click local single file and verify menu shows: Open / Upload / Reveal in Finder / Copy Name / Copy Full Path / Refresh.
5. Right-click a local file outside current selection and confirm selection switches to that row.
6. Right-click a local file inside current multi-selection and confirm selection is preserved.
7. Use local context `Copy Name` / `Copy Full Path` for multi-selection and verify clipboard has newline-separated values.
8. Use local context `Upload` on multi-selection and verify queue creates one task per selected source.
9. In remote pane, repeat `Cmd-click` and `Shift-click` selection checks.
10. Confirm remote status bar selected count/size reflects multiple selected rows.
11. Right-click remote item and verify menu shows: Download / Copy Name / Copy Full Path / Refresh.
12. Use remote context `Download` on multi-selection and verify queue creates one task per selected source.

## Select All Hotkey + Text Selection Guard (M4.6.1)

- Click anywhere inside the local file list pane (not the path input). Press `Cmd+A` and verify all local entries in the current directory are selected.
- Click anywhere inside the remote file list pane (not the remote path input). Press `Cmd+A` and verify all remote entries in the current directory are selected.
- Put cursor inside the local path input, press `Cmd+A`, and verify only the input text is selected (no file selection changes).
- Put cursor inside the site manager form input (any input field), press `Cmd+A`, and verify only the input text is selected.
- If you test `Ctrl+A` compatibility, verify it behaves the same as `Cmd+A` for the active pane.
- Confirm the browser UI text in tables does not become selected after pressing `Cmd+A` (only row highlight changes).

## Security and Data Hygiene Checks

- `profiles.json` contains no `password`, `passphrase`, or private key content.
- `credentials.enc.json` exists (if password saving enabled) and does not expose plaintext password.
- Transfer task list / logs do not include password values.

## Suggested Commands

- Build: `npm run build`
- Unit tests: `npm test`
- Package (unpacked app): `npm run package`
- Dist artifacts (dmg/zip): `npm run dist`
- Secret leak helper: `npm run check:secrets -- --user-data "$HOME/Library/Application Support/CoFinder"`

## Packaging Smoke (M5)

- Launch packaged app from `release/` and verify local pane browsing works.
- Open Site Manager and login with an existing profile.
- Verify remote browsing, one upload, and one download succeed.
- Quit app and verify no orphan `rsync` / `ssh` processes remain.
