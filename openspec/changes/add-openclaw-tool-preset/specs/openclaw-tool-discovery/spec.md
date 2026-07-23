## ADDED Requirements

### Requirement: RestX detects the default OpenClaw installation
The built-in OpenClaw preset SHALL identify OpenClaw from its default state directory or main configuration file and SHALL appear as a separate tool card.

#### Scenario: Default state directory exists
- **WHEN** `${HOME}/.openclaw` is a real directory
- **THEN** the OpenClaw tool is marked detected with the matching path as evidence

### Requirement: OpenClaw files are classified by purpose
The OpenClaw preset SHALL classify the main configuration as config, workspace bootstrap and memory Markdown as instructions, agent transcript JSONL as conversations, and Gateway JSON-line files as logs.

#### Scenario: State directory contains standard files
- **WHEN** an OpenClaw state fixture contains `openclaw.json`, workspace bootstrap files, memory Markdown, and agent session transcripts
- **THEN** each safe file appears in its corresponding config, instruction, or conversation folder

#### Scenario: Credential-bearing files are excluded
- **WHEN** the state directory contains credentials, auth profiles, secrets, tokens, databases, or caches
- **THEN** those entries do not appear in candidates or file folders

### Requirement: OpenClaw conversations are browsable and grouped
OpenClaw transcript files SHALL use a JSONL profile that extracts session time, session identity, workspace, user-visible summary, and event tags.

#### Scenario: Transcript includes a session header and messages
- **WHEN** a transcript begins with a session header containing `id`, `cwd`, and `timestamp` and later includes user, assistant, tool-result, or compaction entries
- **THEN** RestX groups the file under the header workspace and labels each supported entry type in the JSONL list

### Requirement: OpenClaw Gateway logs are discovered across macOS and Windows
The OpenClaw preset SHALL discover the official default and fallback Gateway log locations for macOS and Windows.

#### Scenario: macOS preferred temporary log exists
- **WHEN** discovery runs for `darwin` and `/tmp/openclaw/openclaw-YYYY-MM-DD.log` exists
- **THEN** the file appears in the OpenClaw log folder

#### Scenario: Windows user-scoped temporary log exists
- **WHEN** discovery runs for `win32` and `${TEMP}/openclaw-user123/openclaw-YYYY-MM-DD.log` exists
- **THEN** the file appears in the OpenClaw log folder

#### Scenario: macOS launchd log exists
- **WHEN** `${HOME}/Library/Logs/openclaw/gateway.log` or a profile variant exists on macOS
- **THEN** the file appears in the OpenClaw log folder

### Requirement: Structured Gateway logs use the JSONL viewer
OpenClaw Gateway `.log` files SHALL be treated as JSONL and SHALL expose time, message, level, subsystem, search, and formatted line detail through the existing browser.

#### Scenario: User opens a Gateway log
- **WHEN** a discovered Gateway log contains one JSON object per line
- **THEN** RestX shows a paged line list with log-level tags and allows each line to open as formatted JSON
