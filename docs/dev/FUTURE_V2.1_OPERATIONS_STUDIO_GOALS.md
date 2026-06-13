# Future v2.1 Operations Studio Goals

Status: future product direction. This is not an implementation plan yet.

## Product Goal

CoFinder should become a personal local/remote Operations Studio: a safe GUI for the server and file-management actions the user would otherwise perform through CLI commands.

The goal is not to add a button for every command. The goal is to make operations discoverable, previewable, repeatable, and visible in Jobs without crowding the existing V12 pane toolbar.

## Scope

Focus on:

- Command discovery.
- Server and directory inspection.
- Repeatable operation presets.
- Safe execution through existing main-process services and Jobs.

Do not make this an AI-first milestone. AI/agent experiments can happen in a separate research track, but this milestone should stand on deterministic product value.

## Command Palette

Add a Command Palette as the primary entry point for broad command discovery.

Target shortcut: `Cmd+Shift+P`, unless that conflicts during implementation.

The palette should search:

- Pane navigation and view commands.
- Existing file operations such as Open, Edit, View Text, Search Contents, Rename, Batch Rename, Delete, Copy/Move To, Compress/Decompress, Generate MD5, Touch, Change Timestamp, and Change Permissions.
- Server/directory inspection commands such as disk usage, current directory size, large-file search, recent-file search, log tail, permission checks, and broken symlink checks.
- Jobs actions such as retry failed, clear completed, stop/cancel, and reveal details.
- Saved Runbooks once Runbooks exist.
- Relevant Preferences pages or settings.

The palette must be context-aware:

- Active pane: local or remote.
- Current folder.
- Current selection.
- Current profile/session for remote operations.
- Jobs pane selection or filter when relevant.

Safety rules:

- Read-only checks may run directly.
- Write-capable actions must show the same preview/confirmation flow as their normal UI entry point.
- Destructive actions must keep explicit confirmation.
- Long-running work must enqueue visible Jobs.
- The renderer must not execute shell commands directly.

## Operations Panel

Add an Operations panel for workflows that are powerful but too numerous or too low-frequency for the pane toolbar.

Suggested sections:

- **Status**
  - Remote disk usage.
  - Current directory size.
  - Connection/session health.
  - Recent activity summary.
- **Inspect**
  - Large-file search.
  - Empty-directory search.
  - Log tail.
  - Text search.
  - Permission anomalies.
  - Broken symlink checks.
- **Transform**
  - Existing operations such as compress/decompress, MD5, batch rename, copy/move, delete, chmod, touch, and timestamp changes.
  - This section should link to the existing safe flows, not duplicate separate implementations.
- **Runbooks**
  - Saved operation presets after the underlying commands are stable.
  - Examples: archive a result folder, generate checksums, summarize a project directory, inspect a remote run directory, clean known temporary outputs.
- **History**
  - Recent operations.
  - Failures and retries.
  - Copyable summaries for notes or troubleshooting.

The Operations panel should complement the Jobs pane. Jobs shows execution state; Operations is for command selection, presets, and inspection workflows.

## Toolbar Policy

Do not continue adding every new operation to the pane toolbar.

Keep the toolbar focused on:

- Navigation.
- Refresh.
- Upload/download.
- Delete.
- Inspector.
- View mode and grouping controls.
- Small set of very high-frequency pane actions.

Use:

- Context menus for selected-item operations.
- Command Palette for fast recall.
- Operations panel for server-inspection and runbook workflows.
- Jobs pane for execution status.

## AI/Agent Position

AI/agent features are tempting and worth exploring, but they should not be treated as a core v2.1 product dependency.

Reasons:

- External tools such as Codex, Claude Code, and opencode already cover broad agentic execution and may improve quickly.
- CoFinder should not add AI merely because agents are popular.
- The durable product value is the local context, safety boundary, previews, Jobs integration, and repeatable operation model.

Acceptable experimental AI scope:

- A playground branch or mockup for natural-language-to-operation-plan.
- Read-only summaries of selected logs or Jobs failures.
- Runbook draft generation that requires user review.

Non-goals for this target:

- Autonomous destructive execution.
- Replacing external coding/agent tools.
- Sending passwords, saved credentials, or broad filesystem contents to a model.
- Making AI the only entry point for any operation.

## Acceptance Themes For A Future Implementation Plan

- Common operations are reachable quickly without adding toolbar clutter.
- The same operation can be launched from context menu, Command Palette, or Operations panel while sharing one main-process implementation.
- Read-only server checks feel faster than opening a terminal.
- Write/destructive actions remain previewable and explicit.
- Jobs and History make long-running or failed operations understandable.
- The design preserves pane isolation and the existing renderer -> preload -> IPC -> main-service boundary.
