# V12 Layout Regression Checks

V2.7 decision: do not add a screenshot-test dependency yet. Use this stable visual checklist until Playwright or another screenshot runner is introduced deliberately.

Check these states at a normal desktop width and a narrower width around 1100 px:

- local and remote connected, no Inspector;
- local selection and remote selection;
- Inspector open for local and remote single selection;
- empty local directory and empty remote directory;
- transfer drawer expanded with Running, Failed, and Done filters;
- active Remote edits panel with clean and conflict sessions;
- Preferences modal open.

Pass criteria:

- no text overlap;
- file list remains usable when Inspector is open;
- disabled actions are visibly disabled;
- drawer and Remote edits panel do not cover pane rows unexpectedly;
- breadcrumb/path controls remain readable.
