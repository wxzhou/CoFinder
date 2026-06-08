# CoFinder Smoke Test Checklist

Use this checklist before a release candidate. Prefer an isolated test workspace.

## V1.2 Finder shell (default) — M6

**Acceptance:** plain `npm run dev` and packaged app with **no** env vars load this shell (`getRendererUiMode` → `shell-v12`). Core file operations should match V1.1; this section only highlights shell-specific checks.

**Legacy classic UI:** use **`?ui=v11`**, **`?legacy=1`**, **`COFINDER_LEGACY_UI=1`**, or a build with **`VITE_COFINDER_LEGACY_UI=1`** — then run overlapping **V1.1 baseline** checks below for parity.

- **Layout:** sidebar, tab strip, dual panes, per-pane toolbars, and bottom Jobs pane render without overlap; inactive pane reads visually cooler than the focused pane.
- **Pane toolbars:** local and remote toolbar buttons operate on their own pane without needing active-pane preselection; Copy Path appears once per pane on the breadcrumb row.
- **Remote (M4):** disconnected pane shows embedded connect + profile list + **Open Site Manager**; connect and failures surface in-pane; connected list matches M2 behavior.
- **Inspector (M3):** single-click selection timing, double-click folder navigation, Cmd/Ctrl+A immediate reveal — no inspector flash regressions.
- **Jobs (M5):** enqueue from context menu or toolbar; drawer shows live upload/download/delete/gzip jobs, **Pin** / **Clear** / expand; cancel pending / stop running transfer jobs.
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

- **Open Preferences:** in default V12 UI, click the sidebar footer Preferences button; in legacy classic UI, use the top-bar Preferences button. Confirm the modal opens and closes cleanly.
- **Settings round-trip:** change row density, queue auto-hide delay, default pane ratio, and default local path. Save, quit, relaunch, and confirm values persist.
- **Default local path:** set a temporary local test directory as default, relaunch, and confirm the first local pane opens there. Reset to blank when done.
- **Restore last local path:** enable restore last session, navigate the active local pane to another isolated test directory, quit, relaunch, and confirm the first local pane opens at that last local path. Remote connections must not auto-reconnect.
- **Delete confirmation:** toggle confirmation off in an isolated test folder, delete a disposable local file, and confirm it deletes without the modal. Turn the setting back on.
- **Hidden files:** toggle show hidden files and confirm dotfiles appear/disappear in local and remote listings after refresh.
- **Conflict policy:** set default conflict policy to `rename`, trigger an upload/download conflict, and confirm CoFinder keeps both without prompting. Repeat with `skip` on a two-file transfer, then reset to `prompt`.
- **Queue auto-hide:** set delay to 1 second, run a successful small transfer, and confirm the queue hides after success when not pinned.
- **Timestamp preservation:** with preserve timestamps enabled, run a small transfer and confirm modification time is preserved where the filesystem/server supports it. Disable it, repeat with a new file, and confirm rsync no longer preserves the original mtime.
- **Appearance:** toggle compact/comfortable density, default inspector visibility, pane ratio, and sidebar visibility; relaunch and confirm settings apply. In V12, also use the fixed titlebar sidebar button beside the traffic lights and `Cmd+Option+B` to hide/show the sidebar; confirm the button does not move between expanded and collapsed states.
- **Shortcut display:** confirm Preferences shows the implemented shortcut list and that the bindings still match the V1.3 shortcut smoke section.

## V1.7 search, filter, and navigation

- **Local quick filter:** open a local folder with several files/folders, type a substring in the local filter box, and confirm only matching names remain. Clear the filter and confirm the full current listing returns.
- **Remote quick filter:** connect to the remote test root, type a substring in the remote pane toolbar filter, and confirm filtering is local to the already-loaded listing with no navigation.
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

## V1.9 packaging, diagnostics, and onboarding

- **First-run onboarding:** launch with a fresh Electron userData directory, review the onboarding text, and confirm it explains SFTP password saving, rsync BatchMode SSH, and safeStorage unavailability. Dismiss it, relaunch, and confirm it stays dismissed.
- **Copy diagnostics:** open Preferences → Diagnostics, click Copy Diagnostics, paste into a scratch text file, and confirm it includes app version, platform, arch, userData path, log path, and ssh/rsync availability.
- **Diagnostics redaction:** before copying diagnostics, create a failed transfer or error path containing a fake `password=hunter2` / `token=abc123` string if practical; confirm copied diagnostics redact those patterns and never include saved profile passwords or private key contents.
- **Open logs:** click Open Log Folder and Open Log File; confirm Finder/default editor opens safe local paths under app userData.
- **Check for updates:** click Check for Updates and confirm it reports the manual GitHub Releases policy rather than attempting a silent install.
- **Packaged smoke:** after `npm run dist`, launch the packaged app and repeat Copy Diagnostics plus one local browse check.

## V2.10 M1 / v1.9.2 multi-lane Jobs

- **Transfer serial lane:** enqueue two large uploads or downloads. Confirm only one transfer runs at a time and the second waits pending until the first finishes or stops.
- **Compress lane concurrency:** set Preferences -> Jobs -> Compression jobs at once to `2`, enqueue two independent Compress/Decompress/Generate MD5 jobs, and confirm both can run together in Jobs.
- **Queue filters:** expand Jobs and confirm the top row shows two segmented filter groups: All queues / Transfer / Compress / Delete, then All / Running / Failed / Done. Combine `Compress` with `Running` and confirm only running/pending compression-lane jobs remain visible.
- **Cross-lane concurrency:** start one long upload/download and one independent compression-style job. Confirm the compression job can run while the transfer lane remains busy.
- **Path lock:** start deleting a disposable folder, then enqueue compression or MD5 on a child path before delete finishes. Confirm the child job does not start until the delete job releases the path lock.
- **Retry failed:** create one failed transfer and one failed compression job, use Retry failed, and confirm each returns to its own lane while honoring current concurrency.

## V2.10 M2 / v1.9.3 remote Copy To / Move To

- **Copy file:** select one remote disposable file, right-click `Copy To...`, enter a destination folder ending with `/`, choose `fail` for existing targets, and confirm Jobs shows a Relocate copy job that completes and creates the copied file.
- **Copy folder:** repeat `Copy To...` on a small disposable remote folder and confirm the folder copy appears without merging into an existing folder.
- **Move file/folder:** select one remote disposable file and one disposable folder in separate runs, right-click `Move To...`, confirm the destructive dialog, and confirm the source disappears after the Relocate move job succeeds.
- **Keep both:** copy a remote file to a destination where the target already exists, choose `rename`, and confirm CoFinder creates a `copy`-suffixed target instead of overwriting.
- **Failure visibility:** copy or move to an unwritable/missing destination and confirm the job remains visible as failed with an actionable error.
- **Path locks:** enqueue a long remote delete on a parent disposable folder, then enqueue `Move To...` for a child path before delete finishes. Confirm the move remains pending until the delete releases the path lock.

## V2.10 M3 / v1.9.4 content inspection

- **Search local contents:** right-click a local text file or folder -> File Operation -> `Search Contents...`, search for a known literal string, and confirm matching path/line/preview rows appear.
- **Search remote contents:** repeat on a disposable remote text file or small folder and confirm results show without downloading the searched file into an edit session.
- **Search result View:** click `View` on a search result and confirm the read-only `View Text` dialog opens for that result path.
- **Search cap:** search a fixture with more than 200 matches and confirm the result count is capped/truncated rather than flooding the UI.
- **View local text:** right-click a local text file -> File Operation -> `View Text...`; confirm the in-app read-only viewer opens and `Load More` is disabled for small files.
- **View remote text:** connect to a disposable remote test root, create/select a text file, use File Operation -> `View Text...`, and confirm the viewer opens without creating a remote edit session or local editable copy.
- **Large text chunking:** open a text file larger than 256 KiB and confirm the viewer initially loads the first chunk, shows loaded/total size, and can append more with `Load More`.
- **Binary rejection:** select a binary-looking local and remote file and confirm `View Text...` shows a clear unsupported-text error instead of opening unreadable bytes.

## V2.10 M4 / v1.9.5 expandable list rows

- **Preference default:** open Preferences -> Appearance and confirm `Show folder disclosure controls in list view` is off by default; save it on and confirm both panes show vector disclosure controls beside folders.
- **Local expansion:** expand a local folder, confirm children appear indented inline, nested folders can expand again, and clicking the folder name still selects while double-clicking navigates into the folder.
- **Remote expansion:** connect to an isolated remote test root, expand a remote folder, confirm children load on demand without navigating away, and expand a nested remote folder.
- **Selection order:** with expanded children visible, use click, Shift-click, Arrow Up/Down, Shift+Arrow Up/Down, and Cmd+A; confirm selection follows the visible flattened order.
- **Collapse safety:** select one or more expanded child rows, collapse the parent folder, and confirm hidden child rows are no longer selected.
- **Refresh invalidation:** expand a folder, refresh the pane, and confirm expansion state clears so stale child listings are not shown.
- **Copy ordering:** select visible root and child rows in a mixed order, use Copy Name / Copy Full Path, and confirm pasted lines follow the current visible file-list order.

## V2.10 M5 / v1.9.6 icon view

- **Pane independence:** switch the local pane to Icon view and leave the remote pane in List view, then reverse them; confirm each pane keeps its own mode.
- **Persistence:** set Preferences -> Appearance default local and remote views to Icon, save, create a new tab or relaunch, and confirm panes use the saved defaults. Reset to List if desired.
- **Icon selection:** in Icon view, single-select, Cmd-select, Shift-select, Arrow Up/Down, Shift+Arrow Up/Down, and Cmd+A; confirm selected items match the icon grid order.
- **Open/navigate:** double-click a local folder and a remote folder in Icon view and confirm navigation; double-click files and confirm local/remote open behavior matches List view.
- **Context menu and rename:** right-click local and remote icon items and confirm existing selected-item menus appear. Use Rename/F2 and confirm the inline icon-label editor commits and cancels correctly.
- **Transfers:** drag a local icon item to the remote pane and a remote icon item to the local pane; confirm upload/download Jobs are queued as in List view.
- **List compatibility:** switch back to List view and confirm column widths, visible columns, sorting, disclosure controls, and row selection still behave as before.

## V2.10 M6 / v1.9.7 column view

- **Switching:** switch local and remote panes independently to Column view, then back to List/Icon; confirm each pane keeps its own mode and does not affect the other pane.
- **Local columns:** in local Column view, click a folder and confirm its contents appear in the adjacent column without navigating away; click a nested folder and confirm a third column appears.
- **Remote columns:** repeat under an isolated remote test root; confirm remote child columns show loading/error/empty states as needed and do not disconnect the pane on a child-listing failure.
- **Selection and operations:** select files/folders in any column and confirm context menus, Rename/F2, Delete, Copy Name, Copy Full Path, and Inspector use the selected item.
- **Double-click behavior:** double-click a folder in Column view and confirm the pane navigates into it; double-click a file and confirm the same open/edit behavior as List view.
- **Drag/drop:** drag a local column item to the remote pane and a remote column item to the local pane; confirm Jobs enqueue the same upload/download work as List view.
- **Refresh invalidation:** open multiple child columns, refresh or navigate the pane, and confirm old child columns disappear instead of showing stale listings.

## V2.0 stable personal release

- **Full pass:** run all applicable sections in this file against a clean test workspace before publishing or reissuing `v1.0.0` artifacts.
- **Packaged file load:** launch `release/mac-arm64/CoFinder.app` or the dmg-installed app and confirm the V12 shell renders from `file://` without a blank page.
- **Release identity:** confirm About/version surfaces `1.0.0`, artifact filenames use `CoFinder-1.0.0-arm64`, and docs/changelog refer to V2.0/v1.0.0 consistently.

## V2.1 feedback stabilization

- **Transfer startup:** upload and download a small file; tasks should move from running to active transfer without an unexplained fixed delay.
- **Folder target:** upload a local folder `xyz` into a remote target and confirm the result is `target/xyz`, not `target/xyz/xyz`.
- **Unicode paths:** upload/download files and folders with Chinese characters in local and remote paths.
- **Create/delete:** create local and remote folders, create local and remote text files, and delete local and remote folders inside isolated test roots.
- **Remote Open/Edit:** open a remote `.bed` or tab-delimited text file with `Edit`; save in the configured editor and confirm upload-back. Use remote `Open` on a common image or document and confirm the default macOS app opens an app-managed local copy. Try forcing `Edit` on a binary file and confirm CoFinder asks before opening it in the text editor.
- **Remote source/script Open:** use remote `Open` or double-click on `.sh`, `.py`, `.R`, `.m`, or `.cpp` files with executable permissions. Confirm CoFinder opens the configured text editor without an executable-file warning and does not execute the file.
- **Inspector:** `Cmd+I`, context-menu Show Inspector, and toolbar Inspector should reveal the Inspector without opening a modal; directory selections should show file/folder child counts.
- **Navigation/layout:** verify Home, Copy Current Path (`Cmd+Option+C`), active-pane indicator, macOS CoFinder > Preferences, restore-last-path behavior, and persisted sidebar resizing.
- **Scope cuts:** confirm there is no UI implying remote edit auto-sync, full auto-update install, App Store distribution, or cross-platform support.
- **Security closeout:** repeat profile/credential/settings/log/diagnostics checks and confirm no plaintext secrets are exposed.

## V2.3 navigation feedback fixes

- **Text editor preference:** open Preferences and confirm Text editor is a visible selector with System default, TextEdit, TextMate, and Custom. Select TextMate, save, relaunch if practical, and confirm the value persists.
- **Copy current path shortcut:** focus local and remote panes in turn and press `Cmd+Option+C`; paste into a scratch field and confirm the active pane current path is copied. Confirm `Cmd+Shift+C` still copies selected full paths.
- **Breadcrumb path entry:** in a V12 local pane, confirm no separate full path address field appears next to breadcrumb. Click empty breadcrumb space or double-click the breadcrumb, type a valid local path, press Enter, and confirm navigation.
- **Remote breadcrumb path entry:** connect to the isolated remote test root, press `Cmd+L`, type another allowed remote path, press Enter, and confirm navigation. Press Escape from edit mode and confirm breadcrumb mode returns without navigation.
- **Breadcrumb copy path:** click the breadcrumb Copy Path icon for local and remote panes and confirm the clipboard contains the pane current path.

## V2.8.1 toolbar cleanup

- **No global toolbar:** confirm the V12 shell has no top global toolbar between the tab strip and dual-pane workspace.
- **Local pane toolbar:** verify Back, Forward, Enclosing folder, Home, Refresh, Toggle Inspector, Upload, New Folder, New Text File, Delete, Open Terminal Here, Filter names, Recent, History, and Clear Recent are all on one local toolbar row and operate on the local pane.
- **Remote pane toolbar:** after connecting, verify Back, Forward, Enclosing folder, Home, Refresh, Toggle Inspector, Download, Edit Remote Text File, New Folder, New Text File, Delete, Open SSH Terminal Here, Filter names, Recent, History, and Clear Recent are all on one remote toolbar row and operate on the remote pane.
- **Copy path placement:** confirm each pane has exactly one breadcrumb-row Copy Path button and the former global Copy Current Path button is absent.
- **Disconnect placement:** confirm remote Disconnect is available from the Connected status menu, not from the remote pane toolbar.
- **Remote status placement:** confirm Connected/Offline/Connecting/Error appears immediately beside the remote pane title.
- **Preferences placement:** click the lower-left sidebar gear and confirm the Preferences modal opens.
- **Compact history controls:** confirm Recent, History, and Clear Recent appear as icon controls with tooltips/accessible labels and still perform their original actions.
- **Danger color:** connect to a remote profile and confirm the Connected status menu's Disconnect action is visibly red.

## V2.8.2 selection and Inspector shortcuts

- **Local Shift range:** sort/filter a local folder if useful, click one visible file, then `Shift`-click another visible file; confirm exactly the two files and visible rows between them are selected.
- **Remote Shift range:** repeat the same range-selection check in a connected remote folder.
- **Multi-select Inspector shortcut:** select multiple local files and press `Cmd+I`; confirm the Inspector opens with multi-selection summary. Repeat on remote while connected.
- **Inspector shortcut toggle:** select a single file, press `Cmd+I` to open Inspector, press `Cmd+I` again, and confirm the Inspector closes. Repeat for local and remote.

## V2.8.3 Inspector and keyboard selection

- **Folder Inspector size:** select a local folder, open Inspector, and confirm Size shows a calculated folder size rather than `—`. Repeat on a remote folder.
- **Name-column selection:** select a row and confirm the blue selection background appears only behind the Name column. Click Date modified, Size, Kind, and blank list space; each should clear selection.
- **Keyboard row movement:** select one visible row, press `Down` and `Up`, and confirm selection moves one visible row at a time instead of scrolling the whole list.
- **Keyboard range extension:** select one row, press `Shift+Down` several times and `Shift+Up` once; confirm the contiguous range extends and shrinks from the anchor. Repeat in local and remote panes.
- **Page navigation shortcuts:** confirm `Cmd+Up` / `Cmd+Down` still jump to list top/bottom and `Option+Up` / `Option+Down` still page up/down.
- **Inspector icon polish:** open Inspector for a file and a folder. Confirm the top preview icon is larger, has no rounded-square wrapper, and document icons have rounded page/fold corners.

## V2.8.4 Inspector and remote-edit polish

- **Document icon depth:** compare a file row and Inspector file preview with Finder-style document icons; confirm the page has subtle depth, fold shading, and rounded geometry.
- **Disconnect placement:** connect to a remote profile and confirm Disconnect is absent from the remote toolbar. Open the Connected status menu beside the remote title and confirm Disconnect is available there.
- **Delete separation:** confirm the remote toolbar Delete button is no longer adjacent to any Disconnect control.
- **Progressive folder Inspector:** select a large local folder and a large remote folder. Confirm the Inspector appears quickly, Size / Files / Folders show loading while directory details are calculated, and update in place when done.
- **Remote edit completion:** edit and save a remote text file. Confirm successful upload completion appears in Jobs and auto-hides like a normal successful transfer, while the Remote edits panel does not keep a persistent uploaded row.

## V2.8.5 file-list columns and tab chrome

- **Three-significant-digit sizes:** check file-list Size cells, Inspector size, selected size, and total size. Values should use three significant digits, for example `1.00 KB`, `12.3 MB`, and `123 GB`.
- **Column resizing:** drag the boundaries between Name / Date modified / Size / Kind and confirm widths update without breaking row alignment.
- **Column visibility menu:** right-click a V12 file-list header. Confirm Name is checked and disabled, and Date modified / Size / Kind / Permission / Owner can be toggled.
- **Permission and Owner columns:** enable Permission and Owner and confirm they render available metadata or `—`.
- **Icon polish:** confirm tab close, new tab, and sort direction controls are icons, not literal `x`, `+`, `^`, or `v` text.
- **Tab chrome:** confirm the first tab aligns with the macOS traffic-light row and the native `CoFinder` title text is not visible above the app.

## V2.8.6 toolbar and long-list polish

- **Grouped toolbar capsules:** confirm local and remote toolbar buttons are grouped into navigation, file action, and history capsules without changing the surrounding header layout.
- **Toolbar glyph size:** confirm toolbar icons are larger but button height, inter-button spacing, color, and stroke weight remain stable.
- **Refresh icon:** confirm both local and remote Refresh icons use the longer-tailed circular arrows.
- **Sticky file headers:** open a folder with enough files to scroll and confirm the file-list header stays visible while scrolling.

## V2.8.7 creation flow and stale connection fixes

- **Blank-space deselect:** select one or more files in a long local folder, scroll if needed, click blank file-list space below the rows, and confirm selection clears. Repeat in a connected remote folder.
- **New Folder naming:** click local and remote New Folder and confirm the dialog opens with `New Folder` fully selected so typing immediately replaces it.
- **New Text File naming:** click local and remote New Text File and confirm the dialog asks for a file name instead of silently creating `Untitled.txt`.
- **Stale remote connection:** connect to a disposable remote test root, let the machine sleep or network drop, then try Refresh or path navigation. Confirm CoFinder no longer remains misleadingly Connected when the SFTP session is stale and prompts reconnect behavior.
- **Inspector labels:** select a local and remote file, open Inspector, and confirm the metadata row says `Kind` and Owner is present, using `—` when unavailable.
- **Remote Owner display:** enable the Owner column on a remote pane and open Inspector for the same item; confirm both show a username when the server can resolve the UID.
- **Remote preview cache reuse:** open a remote text file, update the remote file from another session, then open it again while the editor remains open. Confirm the same local cache path is reused and refreshed rather than creating a second temporary preview path.
- **Remote auto-refresh preference:** open Preferences and confirm the Auto-refresh checkbox, interval field, and `seconds` label are grouped together. With the checkbox off, confirm the interval field appears disabled/grey. Enable it, set a short interval such as 5 seconds, then change the connected test directory from another session and confirm the active remote pane refreshes. Disable the setting afterward.
- **Remote initial loading state:** connect to a remote profile and confirm the remote pane shows a loading message during the first list instead of briefly claiming the folder is empty.
- **Folder upload details:** upload a local folder with several files to the disposable remote test root. Expand Jobs and confirm the parent task shows folder completed/total files, current file name, current file progress/speed/ETA, and a collapsible child list with running, pending, and completed file states.
- **Jobs pane redundancy:** expand Jobs and confirm title, active/queued summary, All / Running / Failed / Done filters, Pin/Clear/Retry failed, and Hide are consolidated into one top row.
- **Context menu split:** right-click a selected local file and confirm only item actions appear. Right-click blank local list space while the file remains selected and confirm only current-folder actions appear. Repeat for remote.
- **Context menu placement:** right-click a row near the lower edge of the file list and confirm the menu moves upward enough to remain fully visible.
- **Gzip compression:** right-click a single local file and choose Compress as gzip; confirm `<name>.gz` appears and a second attempt reports that the gzip target already exists. Repeat on a single remote file in the disposable remote test root. Confirm folders and multi-selection do not show the gzip action.

## V2.5 remote text edit MVP

- **Edit entry point:** connect to the isolated remote test root, select exactly one text file with content such as BED/tab-delimited text, then use the remote pane Edit action or right-click `Edit`. Confirm the configured text editor opens an app-managed edit-cache copy.
- **Edit save upload:** modify and save that local edit-cache copy in the editor. Confirm CoFinder reports the upload, the remote pane refreshes when viewing the file's parent folder, and reopening/downloading the remote file shows the saved content.
- **Edit conflict:** open a remote text file for Edit, change the remote file from another shell/session before saving the local edit, then save locally. Confirm CoFinder reports a conflict, does not overwrite the remote file, and keeps the local edit copy available.
- **Edit status UI:** while an edit session is active, confirm the Remote edits panel lists the remote path and state. Test Reveal, Save Back Now, Stop Monitoring, and Discard Local Copy. For a conflict/failed session, also test Re-download, Force upload after the confirmation prompt, Remote Copy, and Copy Paths.
- **Open uses editable local copy:** use right-click `Open`, double-click, or Space on the same remote text file and confirm it opens an app-managed local copy. Save a change and confirm CoFinder uploads back after conflict checks.
- **Unsupported / confirmed edit:** select a remote directory and a multi-selection in turn; confirm Edit/Open are unavailable where appropriate. Select a binary file and choose `Edit`; confirm CoFinder asks before forcing the text editor.

## V2.7 V12 UI regression

- **Task filters:** expand the Jobs pane and switch All / Running / Failed / Done. Confirm filtering does not clear unresolved failed tasks.
- **Empty panes:** open empty local and remote directories and confirm the empty state is visible and not mistaken for a broken list.
- **Inspector density:** open Inspector on local and remote single selections and confirm metadata remains scannable without auto-opening on ordinary single click.
- **Layout checklist:** run `docs/dev/v12-layout-regression-checks.md` before release candidates.

## V1.3 interaction efficiency and remote preview

- **Shortcuts:** verify `F2` rename, Delete/Backspace delete confirmation, `Cmd+I` Get Info, `Cmd+Shift+C` copy path, `Cmd+Option+C` copy current path, `Cmd+Option+B` toggle sidebar, `Cmd+R` refresh, `Cmd+N` / `Cmd+W` tab actions, `Cmd+[` / `Cmd+]` tab switching, `Cmd+U` upload, `Cmd+D` download, `Cmd+1` / `Cmd+2` pane focus, and `Cmd+K` Site Manager. Repeat inside text fields to confirm native text behavior is not hijacked.
- **Pane splitter:** drag the V12 pane divider; quit/reopen dev session and confirm ratio persists; double-click divider and confirm 50/50 reset.
- **Tab reorder:** drag tabs into a new order; confirm active tab and local/remote pane state stay with the tab.
- **Local favorites:** add current local folder; reorder/remove it; verify hover-only up/down arrow buttons and full path subtitle; restore default locations; confirm clicks affect local pane only.
- **Remote favorites:** connect using a saved profile; add current remote path; reorder/remove it; verify hover-only up/down arrow buttons and full path subtitle; click a remote favorite and confirm only the remote pane navigates.
- **Remote Open:** double-click a remote file with no obvious text extension, or right-click it and choose `Open`; confirm the default macOS app opens an app-managed local copy. Save a change and confirm upload-back or conflict handling.
- **Remote Space key:** press Space on a single selected remote file and confirm it follows remote `Open` semantics. Right-click the same file and confirm there is no separate remote `Quick Look` item.
- **Remote Edit:** right-click a remote text file and choose `Edit`; confirm the configured text editor opens. Try a binary file and confirm the force-open prompt appears before the text editor is launched.
- **Local-copy cleanup:** local-copy files live under the macOS temp directory in `remote-edit/<tab-hash>/`. Open a remote local-copy session, use the Remote edits panel `Discard` action, and confirm the local copy is removed. Quit-time cleanup should also close remaining local-copy watchers.

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

## V2.8.8 Jobs pane and destructive task queue

- **Jobs pane identity:** enqueue one upload, one download, one delete, and one gzip job; confirm the bottom drawer is labeled Jobs and shows each type with a matching icon/text label.
- **SFTP fallback:** with a password-auth SFTP connection that can browse remotely but lacks passwordless rsync SSH, upload and download disposable files/folders and confirm each job succeeds over SFTP instead of staying failed with rsync exit code 255.

- **Delete jobs:** delete a disposable local file/folder and a disposable remote file/folder. Confirm the confirmation dialog closes immediately after confirmation and the delete appears as a job while the panes remain usable.
- **Large remote delete:** create a disposable deep remote folder tree under the isolated test root, delete the top folder, and confirm the job succeeds without reporting a false missing path.
- **Gzip jobs:** gzip a disposable local file and remote file. Confirm `.gz` appears after success and the job is visible in Jobs.
- **Gzip no overwrite:** create a matching `.gz` target first, run gzip, and confirm the job fails without overwriting the target.
- **Gzip source preference:** with the new preference off, confirm source files remain after successful gzip. Enable the preference on disposable files only and confirm source deletion happens only after success.
- **Remote gzip locality:** run remote gzip on a disposable remote file and confirm the app does not create a download-compress-upload transfer pair; it appears as a single remote gzip job.
- **Job navigation safety:** start a slow delete/gzip in an isolated folder, navigate elsewhere, refresh panes, and confirm the job continues independently.
- **Filters/actions:** confirm All / Running / Failed / Done filters include all job types; retry failed and clear completed still work.
- **Jobs pane resize:** expand Jobs, drag the top edge upward/downward, and confirm the pane height changes while the header row stays usable; double-click the edge to reset height.
- **Auto-hide:** leave Jobs unpinned after successful jobs and confirm it auto-hides according to the queue auto-hide delay preference.

## V2.8.9 file operation submenu

- **Submenu placement:** right-click a single local file and a single remote file. Confirm `Touch`, `Change Timestamp...`, `Compress`, `Decompress`, and `Generate MD5` appear under `File Operation`; confirm remote also includes `Change Permissions`.
- **Touch:** run `File Operation -> Touch` on a disposable local file and remote file, refresh, and confirm the modified time updates without creating new paths.
- **Change Timestamp:** run `Change Timestamp...`, fill Year / Month / Day / Hour / Minute / Second, confirm auto-advance between fields, submit, refresh, and confirm the modified time matches.
- **File compression:** compress a disposable local and remote file. Confirm `.gz` output appears, the source is preserved unless the gzip-source-delete preference is enabled, and a second attempt fails without overwrite.
- **Folder compression:** compress a disposable local and remote folder. Confirm `.tar.gz` output appears and the folder contents can be recovered by Decompress.
- **Decompress:** decompress `.gz`, `.tar.gz`, and `.tgz` fixtures where practical. Confirm existing extraction targets cause a failed job or error and do not overwrite.
- **Generate MD5:** run `Generate MD5` on a disposable local and remote file. Confirm `<name>.md5` appears, includes an MD5 hash plus the original basename, runs as a visible Jobs task, and a second attempt fails without overwrite.
- **Future non-goals:** confirm there are no shipped `grep` or `less` commands yet; those remain planned in `docs/dev/V2.0.x_REMOTE_CONTENT_TOOLS_PLAN.md`.

## V2.8.9 toolbar icon polish

- **Requested toolbar glyphs:** confirm local and remote pane toolbars use the refreshed Home, Toggle Inspector, Upload/Download, and Delete icons.
- **Layout stability:** confirm toolbar height, capsule grouping, button spacing, disabled states, and Delete danger coloring are unchanged from v1.8.8.
- **Preferences tabs:** open Preferences and confirm General, Navigation, Jobs, Remote, Appearance, Shortcuts, and Diagnostics tabs switch without losing unsaved draft changes. Confirm Shortcuts is read-only reference text and Diagnostics actions still work.
- **Auto reconnect:** enable Remote -> Auto-reconnect after sleep or network resume, connect to a disposable remote root, sleep/wake or temporarily drop network, then trigger Refresh. Confirm CoFinder attempts one reconnect before showing a reconnect failure.
- **Paired path restore:** enable Navigation -> Restore local path on connect and Restore remote path on connect. Connect a saved profile, navigate both panes, switch away/back or relaunch, reconnect the same profile, and confirm the remembered profile-specific local/remote pair is restored. Repeat with a local selection or active job and confirm local restore is skipped rather than clearing context.
- **Transfer reliability carry-forward:** repeat the V2.8.8 SFTP fallback and large remote delete checks before packaging a v1.9.0 build.

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
7. Use local context `Copy Name` / `Copy Full Path` for multi-selection and verify clipboard has newline-separated values in the same order currently shown in the file list.
8. Use local context `Upload` on multi-selection and verify queue creates one task per selected source.
9. In remote pane, repeat `Cmd-click` and `Shift-click` selection checks.
10. Confirm remote status bar selected count/size reflects multiple selected rows.
11. Right-click remote item and verify menu shows: Download / Copy Name / Copy Full Path / Refresh.
12. Use remote context `Copy Name` / `Copy Full Path` for multi-selection and verify clipboard order matches the remote file list.
13. Use remote context `Download` on multi-selection and verify queue creates one task per selected source.

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
- Diagnostics copied from Preferences do not include passwords, private keys, or tokens.

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
