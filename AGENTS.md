# CoFinder Agent Rules

These rules are the default contract for coding agents working in this repository.

## Project Posture

- CoFinder is a personal, macOS-only Electron file manager with a V12 dual-pane local/remote UI.
- Prefer stable, predictable file-management behavior over broad rewrites or speculative UI changes.
- Treat `README.md`, `CHANGELOG.md`, `docs/roadmap.md`, and the active `docs/dev/V*_PLAN.md` as the planning source of truth before coding.

## Branching and Versioning

- Use feature branches for hard or risky feature work. Do not merge back to `dev` until the user confirms the feature is ready.
- Development checkpoints in the current hard-feature track use `v1.9.x`; public release numbering is decided later after hands-on use.
- Release tags should be created on the final `main` merge commit, not on a development branch, unless the user explicitly asks otherwise.
- Do not create or push tags without explicit release/tagging approval.

## Commit Discipline

- Implement milestone-by-milestone and feature-by-feature.
- Commit after each completed feature or milestone. Do not batch unrelated features into one final commit.
- Do not mix planning/docs cleanup, behavior changes, UI polish, tests, and packaging unless they are inseparable for that milestone.
- Avoid unrelated refactors, formatting sweeps, dependency changes, or folder reshuffles.
- Preserve user edits and uncommitted work you did not create.

## Scope Control

- Read the active plan first, then implement only the requested milestone.
- Treat later milestones as non-goals unless the current plan explicitly depends on them.
- Prefer small edits in existing patterns before adding new abstractions.
- Keep legacy behavior intact unless the milestone explicitly removes it.

## Architecture Rules

- Preserve the existing boundary: `renderer -> preload -> IPC -> main service`.
- Keep IPC channel names centralized in `src/main/ipc/channels.ts`.
- Update shared IPC/model types when contracts change.
- Preserve the IPC response contract: `{ ok, data }` for success and `{ ok, error }` for failure.
- Renderer input is untrusted; validate paths, profiles, and destructive-operation targets in the main process.
- Keep quit-time cleanup, remote session cleanup, and local-copy cleanup paths working.

## Security and Privacy

- Never store plaintext passwords in profiles, tasks, logs, diagnostics, renderer state, or transfer arguments.
- Keep saved credentials behind Electron `safeStorage` and the existing credential service.
- Do not pass saved passwords to rsync or shell commands.
- Redact sensitive values in diagnostics and logs.

## Destructive Operation Guardrails

For delete, rename, overwrite, move, chmod, transfer conflict resolution, compression source deletion, or any operation that can modify or replace user data:

- Require explicit user intent from the UI.
- Validate target existence and identity in the main process.
- Fail clearly on missing targets, permission denied, invalid input, remote disconnection, and path conflicts.
- Never silently ignore destructive failures.
- Do not auto-retry destructive operations unless a plan explicitly requires it.

## Jobs and Remote Operations

- Keep Jobs visible and understandable for long-running upload, download, delete, compression, MD5, and future remote mutation/content work.
- Future parallelism must use lane-specific concurrency plus path locks; do not introduce unrestricted global parallel execution.
- Remote gzip percentage progress remains intentionally unsupported unless a future plan replaces the existing decision in `docs/dev/remote-gzip-progress-decision.md`.

## UI Rules

- Do not redesign the V12 shell unless the milestone explicitly requires UI work.
- Preserve pane isolation: local and remote panes own their own commands, state, columns, view choices, and context.
- Keep selection, keyboard navigation, context menus, drag/drop, breadcrumbs, Jobs, Inspector, and sidebar behavior stable while adding features.
- Use vector icons/components instead of raw ASCII symbols for visible controls.

## Testing and Verification

After substantive code changes:

- Run focused tests for the changed area.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run dev` or an equivalent packaged/dev startup smoke when feasible.
- For release-impacting changes, also run `npm run check:secrets`, package/dist commands as needed, and relevant checks in `docs/release-checklist.md`.
- Do not disable or weaken tests to pass.

## Documentation

- Update `CHANGELOG.md` for every `v1.9.x` development checkpoint with user-visible changes, deferred work, and known risks.
- Update `README.md` when current version, capabilities, build expectations, or user-facing behavior changes.
- Update `docs/roadmap.md` and the active plan when milestone status, scope, order, or deferrals change.
- Update `docs/smoke-test.md` when a feature adds or changes manual verification steps.

## Completion Reports

When finishing a milestone, report:

- Files changed.
- Commits created.
- Acceptance points implemented.
- Tests/builds run and their results.
- Smoke steps still recommended.
- Remaining risks or TODOs.
