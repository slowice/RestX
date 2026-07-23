# OpenClaw Tool Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-platform OpenClaw built-in preset that discovers configuration, instructions, sessions, and structured Gateway logs outside the selected scan root.

**Architecture:** Extend the tool-scanning feature's declarative preset contract with optional portable absolute path templates and platform filters while preserving current `relativePath` behavior. A feature-local resolver expands templates and bounded terminal wildcards; generic discovery consumes resolved locations and reports external authorization roots. OpenClaw-specific paths and JSONL mappings remain entirely in `openclaw.json`.

**Tech Stack:** Electron 39, TypeScript 5.7, Node.js filesystem/path/os APIs, Vitest 3, JSON declarative presets, existing RestX JSONL browser.

## Global Constraints

- Keep all implementation inside `src/features/ai-inspector/`; do not add OpenClaw behavior to `src/platform/`.
- Preserve version-1 `relativePath` semantics for Codex, Claude Code, OpenCode, and user presets.
- Support macOS (`darwin`) and Windows (`win32`) without assuming POSIX path separators.
- Path templates support only `${HOME}`, `${TEMP}`, and `${UID}`; `*` is allowed only in the final path segment.
- Do not read or expose credentials, auth profiles, secrets, tokens, databases, caches, or symbolic links.
- Do not parse arbitrary `logging.file`, custom workspace, or `OPENCLAW_STATE_DIR` values in this version.
- Follow TDD: every production behavior begins with a failing test and a verified RED state.
- Use proxy-free `/usr/local/bin/pnpm` commands.

---

### Task 1: Portable Preset Contract and Validation

**Files:**
- Modify: `src/features/ai-inspector/shared/contracts/ai-tool-preset.ts`
- Modify: `src/features/ai-inspector/main/presets/ai-tools/validator.ts`
- Modify: `tests/ai-tool-discovery.test.ts`

**Interfaces:**
- Produces: `AiToolPathFields` with `relativePath?: string`, `path?: string`, and `platforms?: NodeJS.Platform[]`.
- Produces: `AiToolProbe` and `AiToolSource` declarations that require exactly one of `relativePath` or `path`.
- Consumes: existing `validateAiToolPresets(presets)` public validator.

- [ ] **Step 1: Write failing validation tests**

Add tests that accept:

```ts
const portable: AiToolPreset = {
  id: 'portable',
  displayName: 'Portable',
  version: 1,
  probes: [{ path: '${HOME}/.portable', entryType: 'directory' }],
  sources: [{
    id: 'logs',
    path: '${TEMP}/portable-*',
    platforms: ['darwin', 'win32'],
    label: 'Portable logs',
    maxDepth: 1,
    patterns: [{ glob: '*.log', kind: 'log', viewer: 'jsonl', jsonlProfileId: 'portable-log-v1', label: 'Logs' }]
  }],
  jsonlProfiles: [{
    id: 'portable-log-v1',
    timestampPaths: ['timestamp'],
    summaryPaths: ['message'],
    tagRules: [{ path: 'level', fallback: 'raw-value' }]
  }]
}
expect(() => validateAiToolPresets([portable])).not.toThrow()
```

Add separate rejection assertions for both/neither path fields, `${UNKNOWN}`, `../escape`, wildcard in a parent segment, `**`, and an unsupported platform.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/ai-tool-discovery.test.ts
```

Expected: FAIL because `path` and `platforms` are unknown preset keys.

- [ ] **Step 3: Extend shared types**

Add:

```ts
export type AiToolPathFields = {
  relativePath?: string
  path?: string
  platforms?: NodeJS.Platform[]
}

export type AiToolProbe = AiToolPathFields & {
  entryType: 'file' | 'directory'
}

export type AiToolSource = AiToolPathFields & {
  id: string
  label: string
  patterns: AiToolMatchRule[]
  excludes?: string[]
  maxDepth: number
}
```

- [ ] **Step 4: Implement strict compatible validation**

Update probe/source allowed keys. Add one helper that:

```ts
function assertPathFields(
  value: Record<string, unknown>,
  label: string
): asserts value is Record<string, unknown> & AiToolPathFields
```

The helper must enforce exactly one path field, validate relative paths with the existing rules, require an expanded `path` to begin with a supported variable or an absolute literal, reject unknown `${...}` variables, allow `*` only in the basename, reject `**`, and accept only `darwin`, `win32`, or `linux` platform identifiers.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the Task 1 command and expect all `ai-tool-discovery` tests to pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/features/ai-inspector/shared/contracts/ai-tool-preset.ts src/features/ai-inspector/main/presets/ai-tools/validator.ts tests/ai-tool-discovery.test.ts
git commit -m "feat: extend AI tool preset paths"
```

### Task 2: Cross-Platform Preset Path Resolver

**Files:**
- Create: `src/features/ai-inspector/main/services/preset-path-resolver.ts`
- Create: `tests/preset-path-resolver.test.ts`

**Interfaces:**
- Consumes: `AiToolPathFields`.
- Produces:

```ts
export type PresetPathEnvironment = {
  homeDirectory: string
  tempDirectory: string
  uid?: string
  platform: NodeJS.Platform
}

export function createPresetPathEnvironment(): PresetPathEnvironment

export async function resolvePresetPaths(
  rootPath: string,
  declaration: AiToolPathFields,
  environment?: PresetPathEnvironment
): Promise<string[]>
```

- [ ] **Step 1: Write failing resolver tests**

Create fixtures under `mkdtemp()` and assert:

- `${HOME}/.openclaw` and `${TEMP}/openclaw-*` resolve using injected directories.
- `platforms: ['darwin']` returns no paths under injected `win32`.
- `${UID}` expands when provided and returns no location when unavailable.
- A terminal wildcard returns only immediate matching children, sorts deterministically, caps matches at 32, and excludes symbolic links.
- Exact relative paths remain inside `rootPath`.

- [ ] **Step 2: Run resolver test and verify RED**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/preset-path-resolver.test.ts
```

Expected: FAIL because `preset-path-resolver.ts` does not exist.

- [ ] **Step 3: Implement template expansion**

Use `os.homedir()`, `os.tmpdir()`, `process.getuid?.()`, and `process.platform` for defaults. Normalize `/` and `\` in the template to `path.sep` before resolving. Do not expand general environment variables.

- [ ] **Step 4: Implement bounded terminal wildcard resolution**

Split the resolved template into parent and basename pattern, list only the parent with `readdir({ withFileTypes: true })`, accept regular files/directories but reject symbolic links, match `*` case-insensitively, resolve real paths, de-duplicate, sort, and return at most 32 paths. Return an empty list for `ENOENT`, `EACCES`, or `EPERM`.

- [ ] **Step 5: Run resolver test and verify GREEN**

Run the Task 2 command and expect all tests to pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/ai-inspector/main/services/preset-path-resolver.ts tests/preset-path-resolver.test.ts
git commit -m "feat: resolve portable preset paths"
```

### Task 3: Generic Discovery and External Path Authorization

**Files:**
- Modify: `src/features/ai-inspector/main/services/ai-tool-discovery.ts`
- Modify: `src/features/ai-inspector/main/services/file-scanner.ts`
- Modify: `src/features/ai-inspector/main/register.ts`
- Modify: `tests/ai-tool-discovery.test.ts`
- Modify: `tests/file-scanner.test.ts`

**Interfaces:**
- Consumes: `resolvePresetPaths(...)`.
- Extends internal `ToolDiscoveryResult` with `authorizationRoots: string[]`.
- Extends internal `discoverAiTools(...)` with an optional `PresetPathEnvironment`.
- Extends `scanDirectory(...)` dependencies with:

```ts
type ScanDependencies = {
  authorizeRoot?: (directory: string) => Promise<unknown>
  pathEnvironment?: PresetPathEnvironment
}
```

- [ ] **Step 1: Write failing external discovery test**

Build a detected tool fixture whose probe uses `${HOME}/.nova` and whose source uses `${TEMP}/nova-*`. Assert its external log is a candidate, `authorizationRoots` contains the real external directory, and an undetected tool returns no external authorization roots.

- [ ] **Step 2: Run discovery test and verify RED**

Run the Task 1 command. Expected: FAIL because discovery still calls `resolveWithin()` and has no `authorizationRoots`.

- [ ] **Step 3: Refactor probe and source resolution**

Resolve each declaration to zero or more paths. Keep `resolveWithin()` only inside the resolver for legacy relative paths. Change source walking so its relative candidate path is computed from the specific resolved source root, while candidate sorting and grouping remain unchanged.

- [ ] **Step 4: Collect authorization roots**

For each source belonging to a detected preset:

- Add a resolved directory source directly.
- Add `dirname()` for a resolved file source.
- Keep only roots outside the selected scan root.
- Store real paths, de-duplicate, and never include a symbolic link.

- [ ] **Step 5: Write failing scanner authorization test**

Inject `authorizeRoot` into `scanDirectory`, scan a fixture with an external source, and assert the callback receives the external real directory before the result is returned.

- [ ] **Step 6: Run scanner test and verify RED**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/file-scanner.test.ts
```

Expected: FAIL because `scanDirectory` has no authorization dependency.

- [ ] **Step 7: Wire scanner and main authorization**

After discovery, await `authorizeRoot` for every returned authorization root. In `register.ts`, pass:

```ts
{
  authorizeRoot: (directory) => authorizedPaths.authorize(directory)
}
```

Keep all read, JSONL, search, and reveal IPC handlers unchanged so they continue calling `assertAuthorized`.

- [ ] **Step 8: Run Task 3 tests and verify GREEN**

Run both `ai-tool-discovery.test.ts` and `file-scanner.test.ts`; expect all tests to pass.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/features/ai-inspector/main/services/ai-tool-discovery.ts src/features/ai-inspector/main/services/file-scanner.ts src/features/ai-inspector/main/register.ts tests/ai-tool-discovery.test.ts tests/file-scanner.test.ts
git commit -m "feat: scan external preset sources"
```

### Task 4: OpenClaw Built-In Preset and JSONL Profiles

**Files:**
- Create: `src/features/ai-inspector/main/presets/ai-tools/definitions/openclaw.json`
- Create: `src/features/ai-inspector/main/presets/ai-tools/openclaw.ts`
- Modify: `src/features/ai-inspector/main/presets/ai-tools/index.ts`
- Modify: `tests/ai-tool-discovery.test.ts`
- Modify: `tests/jsonl-browser.test.ts`

**Interfaces:**
- Produces: `openClawPreset: AiToolPreset`.
- Produces JSONL profile IDs `openclaw-session-v1` and `openclaw-gateway-log-v1`.

- [ ] **Step 1: Write failing OpenClaw fixture test**

Create injected HOME and TEMP fixtures with:

```text
.openclaw/openclaw.json
.openclaw/workspace/AGENTS.md
.openclaw/workspace/SOUL.md
.openclaw/workspace/memory/2026-07-23.md
.openclaw/agents/main/sessions/session-1.jsonl
.openclaw/agents/main/agent/auth-profiles.json
.openclaw/credentials/channel.json
TEMP/openclaw-user123/openclaw-2026-07-23.log
```

Assert config/instruction/conversation/log counts, excluded credentials, workspace `C:\Work\RestX` or `/Users/demo/RestX`, and the expected profile IDs.

- [ ] **Step 2: Run discovery test and verify RED**

Run the Task 1 command. Expected: FAIL because OpenClaw is absent from `AI_TOOL_PRESETS`.

- [ ] **Step 3: Create the OpenClaw JSON preset**

Include:

- Probe `${HOME}/.openclaw` and `${HOME}/.openclaw/openclaw.json`.
- HOME state source patterns for `openclaw.json`, `workspace*/AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `MEMORY.md`, `HEARTBEAT.md`, `memory/**/*.md`, and `agents/*/sessions/*.jsonl`.
- macOS `/tmp/openclaw`, `${TEMP}/openclaw*`, and `${HOME}/Library/Logs/openclaw`.
- Windows `${TEMP}/openclaw*`.
- Exact excludes for credentials, auth profiles, secrets, tokens, DB files, caches, sandboxes, media, and lock files.

Session profile paths:

```json
{
  "timestampPaths": ["timestamp", "message.timestamp"],
  "sessionPaths": ["id", "sessionId"],
  "workspacePaths": ["cwd", "message.cwd"],
  "summaryPaths": ["message.content[*].text", "message.content", "summary", "message.text"],
  "tagRules": [
    { "path": "type", "fallback": "raw-value" },
    { "path": "message.role", "fallback": "raw-value" },
    { "path": "message.content[*].type", "fallback": "raw-value" }
  ]
}
```

Gateway log profile uses time candidates, `message`/numbered structured fields for summaries, and `level`/`subsystem` tag rules.

- [ ] **Step 4: Register the preset**

Create the typed JSON wrapper and append `openClawPreset` to `AI_TOOL_PRESETS` without adding tool-id branching anywhere else.

- [ ] **Step 5: Verify JSONL labels and search**

Extend `jsonl-browser.test.ts` with session and Gateway log samples. Assert user/assistant/toolResult/compaction and info/warn/error labels, formatted detail, and a search hit on the log message.

- [ ] **Step 6: Run Task 4 tests and verify GREEN**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/ai-tool-discovery.test.ts tests/jsonl-browser.test.ts tests/user-preset-store.test.ts tests/smart-preset-import.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/features/ai-inspector/main/presets/ai-tools tests/ai-tool-discovery.test.ts tests/jsonl-browser.test.ts
git commit -m "feat: add OpenClaw tool preset"
```

### Task 5: OpenSpec Tracking and Complete Verification

**Files:**
- Modify: `openspec/changes/add-openclaw-tool-preset/tasks.md`

**Interfaces:**
- Consumes: all feature work from Tasks 1-4.
- Produces: completed OpenSpec task status and validation evidence.

- [ ] **Step 1: Mark completed OpenSpec tasks**

Change each finished checklist item from `- [ ]` to `- [x]` immediately after its corresponding implementation and test evidence exists.

- [ ] **Step 2: Run focused regression tests**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/preset-path-resolver.test.ts tests/ai-tool-discovery.test.ts tests/file-scanner.test.ts tests/jsonl-browser.test.ts tests/inspector-page.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 3: Run full automated verification**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm typecheck
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm test
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm build
git diff --check
openspec validate add-openclaw-tool-preset --strict
```

Expected: every command exits 0.

- [ ] **Step 4: Perform functional verification**

Start RestX with isolated runtime data and the fixture HOME/TEMP environment. Verify:

- OpenClaw appears as detected.
- Config, instruction, conversation, and log folders show the expected counts.
- Opening a session shows a JSONL list, workspace grouping, search, and formatted line details.
- Opening a Gateway `.log` shows structured JSONL entries and level labels.
- The Electron main process stays alive and exits normally.

- [ ] **Step 5: Form a stable checkpoint**

```bash
git add openspec/changes/add-openclaw-tool-preset/tasks.md
git commit -m "docs: complete OpenClaw discovery change"
```

- [ ] **Step 6: Run independent push-gate validation**

Create read-only validation tasks against the checkpoint for automated commands, visual acceptance, and Electron process smoke. Each must return structured scope, commands/steps, passes, failures, evidence, duration, and final `PASS`/`FAIL`.

- [ ] **Step 7: Fix failures and re-run affected validation**

Only the primary implementation task may edit or commit. Re-run every affected validation until all applicable gates report `PASS`.
