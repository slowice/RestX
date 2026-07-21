# Change: Discover AI tools and group their files by folder

## Why

The current scanner recursively searches a selected directory for generic configuration and log file names. When the selected directory is the user home, this produces a large, noisy flat list. It also skips every hidden directory, so it cannot reliably discover the standard `.codex`, `.claude`, or `.opencode` locations that identify the tools RestX cares about.

RestX should first answer “which supported AI tools are present?” and only then expose the relevant files inside each tool. Detection must remain local, read-only, explainable, and fast.

## What Changes

- Add a data-driven AI tool preset registry with initial presets for Codex, Claude Code, and OpenCode.
- Detect tools through explicit file/directory probes relative to the selected user directory, including known hidden directories.
- Scan only roots and file patterns declared by a detected preset instead of recursively classifying the entire user directory by default.
- Return detected tools, detection evidence, counts, and a pruned folder tree in the scan result.
- Replace the default flat result list with a tool-folder browser: tool → category/physical folder → file → existing detail panel.
- Keep global search, but present search hits grouped by tool and folder.
- Keep the existing generic scanner as an explicit “other candidates” fallback rather than mixing it into the default tool view.

## Initial Presets

| Tool | Detection probes relative to selected user directory | Primary configuration roots | Primary log roots |
|---|---|---|---|
| Codex | `.codex/` | `.codex/config.toml`, `.codex/AGENTS.md` | known `.codex/log*` text logs only |
| Claude Code | `.claude/` or `.claude.json` | `.claude/settings.json`, `.claude/settings.local.json`, `.claude/CLAUDE.md`, `.claude.json` | known text logs under `.claude/` |
| OpenCode | `.config/opencode/`, `.local/share/opencode/`, or `.opencode/` | `.config/opencode/opencode.json(c)`, `tui.json(c)`, `.opencode/` extensions | `.local/share/opencode/log/` |

Presence means “RestX found local data for this tool,” not proof that its executable is currently installed. The UI will use “已检测到” and show the path used as evidence.

## Impact

- Affected contracts: `ScanResult`, `ScanCandidate`, new tool/folder types.
- Affected main-process services: scanner orchestration, preset matching, folder-tree construction.
- Affected renderer: Inspector summary, result navigation, search presentation.
- Existing config detail, redaction, AI analysis, cache, and provider settings remain reusable.
- No file is read during the detection phase; candidate content is still read only after an explicit user click.

## Non-Goals

- Verifying installation by executing `codex`, `claude`, or `opencode` binaries.
- Scanning every project below the user home for project-local `.claude` or `.opencode` folders.
- Displaying databases, session transcripts, credentials, telemetry, or caches by default.
- Allowing users to edit preset definitions in the UI in this change.
