# CoFinder Smoke Test Checklist (M4.5)

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

## Security and Data Hygiene Checks

- `profiles.json` contains no `password`, `passphrase`, or private key content.
- `credentials.enc.json` exists (if password saving enabled) and does not expose plaintext password.
- Transfer task list / logs do not include password values.

## Suggested Commands

- Build: `npm run build`
- Unit tests: `npm test`
- Secret leak helper: `npm run check:secrets -- --user-data "$HOME/Library/Application Support/CoFinder"`
