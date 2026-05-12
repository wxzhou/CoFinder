# CoFinder Smoke Test Checklist

Use this checklist before a release candidate. Prefer an isolated test workspace.

## V1.2 Finder shell (default) — M6

**Acceptance:** plain `npm run dev` and packaged app with **no** env vars load this shell (`getRendererUiMode` → `shell-v12`). Core file operations should match V1.1; this section only highlights shell-specific checks.

**Legacy classic UI:** use **`?ui=v11`**, **`?legacy=1`**, **`COFINDER_LEGACY_UI=1`**, or a build with **`VITE_COFINDER_LEGACY_UI=1`** — then run overlapping **V1.1 baseline** checks below for parity.

- **Layout:** sidebar, toolbar, tab strip, dual panes, bottom transfer drawer render without overlap; inactive pane reads visually cooler than the focused pane.
- **Toolbar:** back / forward / up / refresh follow the **focused** pane; plug opens Site Manager when disconnected and **disconnects** when connected; upload/download/delete/Get Info / inspector toggle match enabled states of the classic panes.
- **Remote (M4):** disconnected pane shows embedded connect + profile list + **Open Site Manager**; connect and failures surface in-pane; connected list matches M2 behavior.
- **Inspector (M3):** single-click selection timing, double-click folder navigation, Cmd/Ctrl+A immediate reveal — no inspector flash regressions.
- **Transfers (M5):** enqueue from context menu or toolbar; drawer shows live tasks, **Pin** / **Clear** / expand; cancel pending / stop running.
- **Then:** run **Local / Remote / Tabs / Transfer / Multi-select / Quick Look / Selection regression** sections below on the same v12 session (behavior must match V1.1).

## V1.1 baseline (still required for classic UI and v12 parity)

The following sections were written for **V1.1 M6**; they remain the functional baseline.

## V1.4 transfer safety and retry

- **Upload conflict:** create a local file whose name already exists in the remote test root, start upload, choose `cancel`, and confirm no queue task is created and the remote file is unchanged.
- **Upload overwrite:** repeat the upload conflict, choose `overwrite`, wait for success, refresh remote pane, and confirm the remote content was replaced intentionally.
- **Upload rename/keep both:** repeat with `rename`, wait for success, refresh remote pane, and confirm a `copy`-suffixed item appears while the original remains.
- **Upload skip:** select two local files where one conflicts remotely, choose `skip`, and confirm only the non-conflicting item is queued/uploaded.
- **Download conflict:** create a remote file whose name already exists in the local test root; verify `cancel`, `overwrite`, `rename`, and `skip` behave the same way on the local destination.
- **Directory conflict:** repeat at least one upload or download conflict with a directory target and confirm the conflict prompt identifies it as a directory.
- **Retry one failed task:** force an rsync failure (for example invalid remote permissions or temporarily unavailable destination), confirm failed task stays visible, then use `Retry` after fixing the cause.
- **Retry all failed:** create two failed tasks, fix the cause, use `Retry failed`, and confirm tasks restart serially, one running at a time.
- **Copy error detail:** on a failed task, use `Copy error` and confirm the clipboard contains the stable error code/message plus recent rsync detail without credentials.

## V1.5 drag-and-drop transfer and marquee selection

- **Local → remote drag upload:** select one local file, drag it to empty space in the connected remote pane, release, resolve any conflict prompt, and confirm a queued upload appears.
- **Local multi-select / directory drag:** select multiple local items including a folder, drag them to the remote pane, and confirm one queued upload task per selected source.
- **Remote → local drag download:** select one remote file, drag it to empty space in the local pane, release, resolve any conflict prompt, and confirm a queued download appears.
- **Directory row drop target:** drag a local file onto a remote folder row and confirm the upload target is that folder; repeat remote file onto a local folder row for download.
- **Invalid row drop:** drag onto a file row and confirm forbidden/invalid feedback appears and no task is queued.
- **Finder → remote upload:** drag a file or folder from Finder into the connected remote pane and confirm upload uses the same conflict dialog and queue path.
- **Finder non-goal:** drag from Finder into the local pane and confirm it does not enqueue a transfer.
- **Marquee replace:** drag from empty pane background across several rows and confirm the selection becomes exactly the intersected rows.
- **Marquee additive:** hold `Cmd` or `Shift`, drag a marquee over additional rows, and confirm existing selection is preserved while hit rows are added.
- **Gesture priority:** confirm splitter drag still resizes panes, row drag starts transfer, background drag starts marquee, single click selects, and double click opens/enters directories.

## V1.6 preferences MVP

- **Open Preferences:** in default V12 UI, click the toolbar Preferences button; in legacy classic UI, use the top-bar Preferences button. Confirm the modal opens and closes cleanly.
- **Settings round-trip:** change row density, queue auto-hide delay, default pane ratio, and default local path. Save, quit, relaunch, and confirm values persist.
- **Default local path:** set a temporary local test directory as default, relaunch, and confirm the first local pane opens there. Reset to blank when done.
- **Restore last local path:** enable restore last session, navigate the active local pane to another isolated test directory, quit, relaunch, and confirm the first local pane opens at that last local path. Remote connections must not auto-reconnect.
- **Delete confirmation:** toggle confirmation off in an isolated test folder, delete a disposable local file, and confirm it deletes without the modal. Turn the setting back on.
- **Hidden files:** toggle show hidden files and confirm dotfiles appear/disappear in local and remote listings after refresh.
- **Conflict policy:** set default conflict policy to `rename`, trigger an upload/download conflict, and confirm CoFinder keeps both without prompting. Repeat with `skip` on a two-file transfer, then reset to `prompt`.
- **Queue auto-hide:** set delay to 1 second, run a successful small transfer, and confirm the queue hides after success when not pinned.
- **Timestamp preservation:** with preserve timestamps enabled, run a small transfer and confirm modification time is preserved where the filesystem/server supports it. Disable it, repeat with a new file, and confirm rsync no longer preserves the original mtime.
- **Appearance:** toggle compact/comfortable density, default inspector visibility, pane ratio, and sidebar visibility; relaunch and confirm settings apply.
- **Shortcut display:** confirm Preferences shows the implemented shortcut list and that the bindings still match the V1.3 shortcut smoke section.

## V1.7 search, filter, and navigation

- **Local quick filter:** open a local folder with several files/folders, type a substring in the local filter box, and confirm only matching names remain. Clear the filter and confirm the full current listing returns.
- **Remote quick filter:** connect to the remote test root, type a substring in the remote filter box or focus the remote pane and use the V12 toolbar filter, and confirm filtering is local to the already-loaded listing with no navigation.
- **Selection safety:** select several rows, change the filter, and confirm the selection is cleared instead of leaving hidden selected rows active.
- **Local autocomplete:** navigate to two or more local folders, type the beginning of a known recent/favorite path in the local path field, and confirm suggestions appear. Pick one and press Enter to navigate.
- **Remote autocomplete:** navigate to two or more remote folders under the current profile, type the beginning of a visited path, and confirm suggestions appear without extra remote listing until you submit the path.
- **Recent locations:** navigate local and remote paths, use the Recent dropdowns to jump back, then use Clear Recent and confirm the dropdown empties. Remote recents should be scoped to the active saved profile.
- **History dropdown:** navigate A -> B -> C in local and remote panes, use Back/Forward buttons and the History dropdown to jump among entries, and confirm tab-local history remains isolated.
- **Boundary check:** confirm favorites remain pinned sidebar shortcuts, recents are transient history, and Site Manager profiles are only connection records.

## V1.8 remote operations expansion

- **Remote mkdir:** connect to the isolated remote test root, use New Folder, create a disposable folder, refresh, and confirm it appears. Try an invalid name containing `/` and confirm a clear validation error.
- **Remote chmod:** create/select a disposable remote file, use Change Permissions, enter `640`, refresh/Get Info, and confirm permissions update where the server supports chmod. Restore permissions before cleanup if needed.
- **Remote duplicate:** select a small remote file, use Duplicate File, and confirm a `copy`-suffixed file appears with the same content. Try a directory and confirm duplicate is rejected.
- **Copy path polish:** select a remote file and use Copy Full Path; confirm the clipboard contains the normalized remote path only, not credentials.
- **Terminal here:** use local Open Terminal Here and confirm Terminal opens in the local folder. Use remote Open SSH Terminal Here and confirm the command opens an SSH session targeting host/user/path without prompting CoFinder to expose saved passwords.
- **Symlink display:** in a remote fixture containing a symlink, confirm the listing/Get Info identifies it as `symlink` and directory size does not follow it as a directory.
- **Remote directory size:** Get Info on a remote directory, confirm size starts calculating asynchronously, then test Cancel. Repeat on a small directory and confirm size completes without freezing the UI.

## V1.3 interaction efficiency and remote preview

- **Shortcuts:** verify `F2` rename, Delete/Backspace delete confirmation, `Cmd+I` Get Info, `Cmd+Shift+C` copy path, `Cmd+R` refresh, `Cmd+N` / `Cmd+W` tab actions, `Cmd+[` / `Cmd+]` tab switching, `Cmd+U` upload, `Cmd+D` download, `Cmd+1` / `Cmd+2` pane focus, and `Cmd+K` Site Manager. Repeat inside text fields to confirm native text behavior is not hijacked.
- **Pane splitter:** drag the V12 pane divider; quit/reopen dev session and confirm ratio persists; double-click divider and confirm 50/50 reset.
- **Tab reorder:** drag tabs into a new order; confirm active tab and local/remote pane state stay with the tab.
- **Local favorites:** add current local folder; reorder/remove it; verify hover-only up/down arrow buttons and full path subtitle; restore default locations; confirm clicks affect local pane only.
- **Remote favorites:** connect using a saved profile; add current remote path; reorder/remove it; verify hover-only up/down arrow buttons and full path subtitle; click a remote favorite and confirm only the remote pane navigates.
- **Remote preview:** double-click a remote text file with no obvious text extension, or right-click it and choose `Open`; repeat to confirm cached reopen. Update the remote file and confirm CoFinder re-downloads before opening. Repeat with a PNG/JPEG/GIF/WebP image. Try a binary file and confirm an unsupported message.
- **Remote Quick Look separation:** press Space on a remote file and confirm it does **not** open the cached preview path; Space remains reserved for future remote Quick Look behavior.
- **Read-only cache:** after a remote preview opens, attempt to save edits in the local viewer and confirm the cached file behaves as read-only. If you force-edit the cached file outside the app, open the same remote file again and confirm CoFinder re-downloads the remote version instead of showing the local edit.
- **Preview cleanup:** cache files live under the macOS temp directory in `remote-preview/<tab-hash>/` (for example `find "$(getconf DARWIN_USER_TEMP_DIR)remote-preview" -type f`). Open a remote preview, disconnect or close the tab, and confirm the cache entry is cleared.

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
- For V1.8 remote operation tests, use only `/mnt/gpfs1/Users/zhouwenxiong/CoFinder_test` on `sge` or another isolated disposable test root.

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

## UI Polish Smoke (V1.1 M4)

- Click local pane table, then remote pane table; verify active pane highlight switches clearly and `Cmd+A` behavior remains unchanged.
- Verify selected rows still have clear contrast in both panes and hover does not hide selection state.
- Open transfer queue with mixed states (`pending`, `running`, `success`, `failed`) and verify status chips are distinct/readable.
- Open local and remote context menus; verify item spacing/readability improves and disabled items remain clearly disabled.

## Quick Look Smoke (V1.1 M5)

- In local pane, single-select a previewable file and use context menu `Quick Look`; verify macOS Quick Look opens.
- In local pane, keep single-file selection and press `Space`; verify Quick Look opens (when focus is not in an input).
- In local pane, select a directory and trigger `Quick Look`; verify operation is rejected with a clear error message.
- In remote pane, trigger context menu `Quick Look`; verify clear fallback message indicates remote Quick Look is not supported in M5.

## Selection Regression Smoke (V1.1 M6)

- In local pane, select one row, then click blank area inside table container; verify selection clears.
- In remote pane, select one row, then click blank area inside table container; verify selection clears.
- In local pane, create a non-contiguous selection with `Cmd-click`, then `Shift-click`; verify final selection is strict anchor range only.
- Repeat the same non-contiguous + `Shift-click` check in remote pane.

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

## Packaging Smoke (M6)

- Launch packaged app from `release/` and verify local pane browsing works.
- Open Site Manager and login with an existing profile.
- Verify remote browsing, one upload, and one download succeed.
- Quit app and verify no orphan `rsync` / `ssh` processes remain.
