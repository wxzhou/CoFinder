# CoFinder Development Rules (V1.1)

## Primary Goal

Ship V1.1 in controlled milestones without regressing V1 behavior.

## Mandatory Rules

- Work milestone-by-milestone; do not mix multiple milestones in one PR.
- Do not introduce V1.1 features outside the current milestone scope.
- No unrelated refactor, formatting sweep, or folder reshuffle.
- Keep existing architecture boundaries (`renderer -> preload -> IPC -> service`).
- Preserve IPC response contract: `{ ok, data }` / `{ ok, error }`.
- Preserve security boundaries (no plaintext password in profile/task/log).

## Change Discipline

- Prefer minimal edits in existing files before creating new abstractions.
- Reuse existing validators and error helpers in `ipcUtils`.
- Update `src/shared/types/ipc.ts` when adding/changing IPC contracts.
- Keep error codes stable and user-facing messages clear.
- Avoid changing business behavior not required by milestone acceptance criteria.

## Destructive Action Guardrails

For delete/rename style operations (especially V1.1 M1/M2/M3):

- Require explicit user intent from UI interaction.
- Validate target path and identity in main process.
- Return deterministic error code/message for:
  - missing target
  - permission denied
  - invalid path/input
  - remote disconnection
- Never silently ignore destructive failures.
- Do not auto-retry destructive operations without explicit product requirement.

## Testing and Verification Requirements

After any substantive change:

- Run `npm test`.
- Run `npm run build`.
- Run `npm run dev` and confirm dev mode starts cleanly before claiming feature completion.
- Execute relevant smoke subset from `docs/smoke-test.md`.
- For release-impacting changes, also verify `docs/release-checklist.md`.

If tests fail:

- Fix forward in current change set.
- Do not disable tests to pass CI.

## Logging and Privacy

- Do not log password, tokens, or sensitive host credentials.
- Keep diagnostics useful but bounded in detail.
- UI error text should not expose internal stack traces.

## IPC and Main Process Rules

- Renderer input is untrusted; validate in main.
- Keep channel names in `src/main/ipc/channels.ts`.
- Register/unregister handlers through existing lifecycle pattern.
- Ensure quit-time cleanup remains intact.

## UI/UX Stability Rules

- Do not redesign UI layout as part of V1.1 feature work unless milestone explicitly says so.
- Keep existing keyboard/multi-select/context menu behavior working.
- Keep tab isolation and queue visibility rules unchanged unless milestone explicitly changes them.

## Documentation Update Rules

For each completed milestone:

- Update `README.md` feature/support notes if externally visible behavior changed.
- Update `docs/smoke-test.md` checklist for new behavior.
- Update `docs/dev/V1.1_PLAN.md` milestone status and risk notes.

