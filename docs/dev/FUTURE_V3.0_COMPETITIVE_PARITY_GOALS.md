# Future v3.0 Competitive Parity Goals

Status: long-term product direction. This is not an implementation plan yet.

## Product Goal

Future `v3.0` can collect mature file-transfer features that are attractive in tools such as WinSCP, FileZilla, ForkLift, and Transmit, but are not urgent for the user's current daily workflow.

These capabilities should be planned after the Operations Studio direction has stabilized.

## Sync And Compare

Potential goals:

- Directory comparison for local/remote and remote/remote contexts.
- Dry-run sync previews before any writes.
- One-way sync.
- Mirror-style sync.
- Conflict policies for newer, older, same-size, same-mtime, missing, and renamed files.
- Saved sync profiles.
- Copyable sync reports.

Guardrails:

- No write sync without preview.
- No silent deletes in mirror mode.
- Long sync work must use Jobs.
- Sync must respect path locks.

## Protocols And Cloud Services

Potential goals:

- Evaluate additional protocols only when they match a real user workflow.
- Keep SFTP/SSH as the first-class path.
- Consider cloud or object-store support only after the UX and credential model are designed.

Guardrails:

- Do not dilute the macOS-personal product by chasing every provider.
- Do not introduce plaintext credential storage.
- Do not weaken the existing safeStorage and diagnostics redaction rules.

## Automation

Potential goals:

- Saved operation presets.
- Import/exportable workflows.
- Manual runbook execution.
- Optional scheduled runs.
- Optional custom-command/script integration for advanced users.

Guardrails:

- Prefer structured operation templates over arbitrary shell.
- Custom commands, if added, must show exact command preview and target context.
- Destructive automation requires explicit opt-in and clear audit history.

## Advanced Transfer Controls

Potential goals:

- Richer queue policy profiles.
- Bandwidth limits.
- More detailed transfer history.
- Stronger retry/reporting controls.
- Exportable transfer/audit reports.
- Deeper conflict-resolution presets.

Guardrails:

- Preserve lane-specific concurrency and path locks.
- Do not introduce unrestricted global parallelism.
- Keep Jobs visible and understandable.

## Why This Is v3.0, Not Near-Term

The user has used mature transfer clients for years without relying heavily on these features. They are valuable for completeness, but not the strongest differentiator for CoFinder.

Near-term product energy should go into Operations Studio: Command Palette, Operations panel, server inspection, safe runbooks, and operation history.
