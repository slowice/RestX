# Knowledge Map Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a RestX feature that scans local problem Markdown, aggregates confirmed metadata into a layered knowledge graph, and safely applies user-confirmed AI classification.

**Architecture:** A blue-zone `knowledge-map` feature capsule owns shared contracts, main-process filesystem and AI services, fixed preload APIs, and a React renderer. Markdown under `~/.restx/knowledge/` remains the source of truth; main returns reduced DTOs and performs fingerprinted backup-and-atomic writeback.

**Tech Stack:** Electron 39, React 19, TypeScript 5.7, Vitest, Testing Library, `yaml`, RestX feature registries and AI Provider registry.

## Global Constraints

- Work only under `src/features/knowledge-map/` plus required feature registries, `src/app-api.ts`, tests, OpenSpec tasks, and documentation.
- Keep the feature in the blue zone and do not move feature-specific logic into `src/platform/`.
- Use `~/.restx/knowledge/` as the root; recursively scan normal subdirectories while excluding hidden directories, `.restx-backup`, and symbolic links.
- Renderer must never receive absolute paths or arbitrary IPC invocation.
- AI modifies no file until the user confirms and never modifies Markdown body text.
- Preserve unknown Frontmatter, create a backup, fingerprint the source, and replace atomically.
- Use the active RestX AI Provider; do not store credentials in the feature.
- Match RestX light-theme tokens and use visible thin curved arrows in a four-column layered layout.
- First version uses page-entry scan plus manual refresh; no file watcher, database, batch AI, or Markdown editor.

---

### Task 1: Knowledge contracts, parsing, scanning, and aggregation

**Files:**
- Create: `src/features/knowledge-map/shared/contracts.ts`
- Create: `src/features/knowledge-map/shared/api.ts`
- Create: `src/features/knowledge-map/main/services/markdown-parser.ts`
- Create: `src/features/knowledge-map/main/services/knowledge-scanner.ts`
- Create: `src/features/knowledge-map/main/services/knowledge-catalog.ts`
- Test: `tests/knowledge-map-domain.test.ts`

**Interfaces:**
- Produces: `KnowledgeProblemSummary`, `KnowledgeScanResult`, `KnowledgeProblemDetail`, `KnowledgeGraph`, `parseKnowledgeMarkdown`, `scanKnowledgeRoot`, and `buildKnowledgeGraph`.
- `scanKnowledgeRoot(options)` consumes injected filesystem methods and returns relative problem IDs only.
- `buildKnowledgeGraph(problems)` returns normalized scene, capability, knowledge, and problem nodes plus directed edges.

- [ ] **Step 1: Write failing parser and aggregation tests**

```ts
test('keeps Markdown without metadata as pending', () => {
  const parsed = parseKnowledgeMarkdown('# File access failed\nDetails', 'problems/file.md')
  expect(parsed.status).toBe('pending')
  expect(parsed.title).toBe('File access failed')
})

test('aggregates canonical labels into one layered graph node', () => {
  const graph = buildKnowledgeGraph([
    organizedProblem('one.md', 'Knowledge Manager', ['Electron'], ['IPC']),
    organizedProblem('two.md', ' knowledge manager ', ['electron'], ['IPC'])
  ])
  expect(graph.scenes).toHaveLength(1)
  expect(graph.capabilities).toHaveLength(1)
  expect(graph.edges.filter((edge) => edge.kind === 'scene-capability')).toHaveLength(1)
})
```

- [ ] **Step 2: Run domain tests and verify RED**

Run: `pnpm vitest run tests/knowledge-map-domain.test.ts`

Expected: FAIL because the knowledge-map modules do not exist.

- [ ] **Step 3: Implement contracts and Markdown parsing**

Implement discriminated problem status types, safe title extraction, YAML `parseDocument`, managed-field validation, bounded preview metadata, and label normalization. Preserve the `Document` only inside main-layer parse results; public DTOs contain no absolute paths or bodies.

- [ ] **Step 4: Implement bounded scanning and graph aggregation**

Implement `scanKnowledgeRoot` with limits `maxFiles: 5000`, `maxDepth: 12`, `maxFileBytes: 2_000_000`; create the root with mode `0o700`, use `lstat`, reject symbolic links, and sort relative IDs. Aggregate labels by trimmed lowercase keys while preserving the first canonical display label.

- [ ] **Step 5: Run domain tests and verify GREEN**

Run: `pnpm vitest run tests/knowledge-map-domain.test.ts`

Expected: PASS for pending, organized, invalid YAML, excluded directory, no-symlink, resource-limit, and canonical aggregation cases.

### Task 2: AI classification and safe Frontmatter writeback

**Files:**
- Create: `src/features/knowledge-map/main/services/knowledge-classifier.ts`
- Create: `src/features/knowledge-map/main/services/markdown-writer.ts`
- Test: `tests/knowledge-classification.test.ts`

**Interfaces:**
- Consumes: `KnowledgeLabelCatalog`, current problem body, active `ResolvedAiProvider`, and injected `fetch`.
- Produces: `classifyKnowledgeProblem(input)`, `normalizeClassificationSuggestion(raw, catalog)`, and `applyKnowledgeClassification(input, dependencies)`.
- `ApplyKnowledgeClassificationInput` includes `problemId`, `sourceFingerprint`, `scene`, `capabilities`, and `knowledge`.

- [ ] **Step 1: Write failing classification and writeback tests**

```ts
test('reuses canonical labels and marks genuinely new labels', () => {
  const result = normalizeClassificationSuggestion(
    { scene: ' knowledge manager ', capability: ['electron'], knowledge: ['IPC', 'Frontmatter'] },
    { scenes: ['Knowledge Manager'], capabilities: ['Electron'], knowledge: ['IPC'] }
  )
  expect(result.scene).toEqual({ value: 'Knowledge Manager', existing: true })
  expect(result.knowledge[1]).toEqual({ value: 'Frontmatter', existing: false })
})

test('backs up and preserves body before updating managed fields', async () => {
  const result = await applyKnowledgeClassification(input, fakeFilesystem)
  expect(result.status).toBe('organized')
  expect(fakeFilesystem.backupText).toBe(originalText)
  expect(fakeFilesystem.writtenText).toContain('scene: Knowledge Manager')
  expect(fakeFilesystem.writtenText).toContain('# Existing body')
})
```

- [ ] **Step 2: Run classification tests and verify RED**

Run: `pnpm vitest run tests/knowledge-classification.test.ts`

Expected: FAIL because classifier and writer exports do not exist.

- [ ] **Step 3: Implement strict classifier**

Build an OpenAI-compatible `/chat/completions` request with one bounded problem and existing vocabulary, `temperature: 0.1`, JSON-only system instruction, a 120-second timeout, and no persistent request/response logging. Parse fenced or plain JSON, require exactly one scene and 1–8 capability and knowledge labels, limit labels to 80 characters, reject control characters, and canonicalize existing values.

- [ ] **Step 4: Implement conflict-safe writer**

Re-read the source inside the knowledge root, compare SHA-256 fingerprint, reject invalid YAML, copy the original to `.restx-backup/<relative-parent>/<basename>.<timestamp>.bak.md`, update only `type`, `scene`, `capability`, and `knowledge` through `yaml` Document APIs, write a private sibling temporary file, and atomically rename it over the source. Clean the temporary file on failure.

- [ ] **Step 5: Run classification tests and verify GREEN**

Run: `pnpm vitest run tests/knowledge-classification.test.ts`

Expected: PASS for existing-label reuse, invalid model output, missing provider mapping, fingerprint conflict, backup, unknown-field preservation, body preservation, and failed replacement.

### Task 3: Namespaced main/preload integration

**Files:**
- Create: `src/features/knowledge-map/shared/channels.ts`
- Create: `src/features/knowledge-map/main/knowledge-service.ts`
- Create: `src/features/knowledge-map/main/register.ts`
- Create: `src/features/knowledge-map/preload/api.ts`
- Modify: `src/platform/main/feature-registry.ts`
- Modify: `src/platform/preload/feature-registry.ts`
- Modify: `src/app-api.ts`
- Test: `tests/knowledge-map-api.test.ts`

**Interfaces:**
- Produces `KnowledgeMapApi`:

```ts
type KnowledgeMapApi = {
  knowledge: {
    scan(): Promise<KnowledgeScanResult>
    read(problemId: string): Promise<KnowledgeProblemDetail>
    classify(problemId: string): Promise<KnowledgeClassificationSuggestion>
    apply(input: ApplyKnowledgeClassificationInput): Promise<KnowledgeScanResult>
    open(problemId: string): Promise<void>
    openRoot(): Promise<void>
  }
}
```

- Main channels use the `feature:knowledge-map:` namespace.
- `KnowledgeService` retains only the latest scan snapshot from relative ID to validated absolute path.

- [ ] **Step 1: Write failing API boundary tests**

Test fixed preload method names, unique channels, no generic invoke/path APIs, stale problem rejection, path containment, and reduced scan/detail DTOs.

- [ ] **Step 2: Run API tests and verify RED**

Run: `pnpm vitest run tests/knowledge-map-api.test.ts`

Expected: FAIL because the feature API and registrations do not exist.

- [ ] **Step 3: Implement service and handlers**

Compose scanner, parser, catalog, classifier, writer, `aiProviderRegistry.executeActive`, `shell.openPath`, and `shell.openPath(knowledgeRoot)`. Validate all unknown IPC inputs and map internal errors to stable feature codes without absolute paths or Markdown bodies.

- [ ] **Step 4: Implement preload and registry composition**

Expose only the six fixed `knowledge` methods, register matching main/preload features, and extend `RestXApi` with `KnowledgeMapApi`.

- [ ] **Step 5: Run API tests and verify GREEN**

Run: `pnpm vitest run tests/knowledge-map-api.test.ts tests/preload-api.test.ts tests/feature-boundaries.test.ts`

Expected: PASS with unique channels and no cross-feature private imports.

### Task 4: RestX renderer and organization workflow

**Files:**
- Create: `src/features/knowledge-map/renderer/feature.tsx`
- Create: `src/features/knowledge-map/renderer/KnowledgeMapPage.tsx`
- Create: `src/features/knowledge-map/renderer/components/LayeredKnowledgeGraph.tsx`
- Create: `src/features/knowledge-map/renderer/components/ProblemInspector.tsx`
- Create: `src/features/knowledge-map/renderer/components/ClassificationDialog.tsx`
- Create: `src/features/knowledge-map/renderer/knowledge-map.css`
- Modify: `src/platform/renderer/feature-registry.ts`
- Test: `tests/knowledge-map-page.test.tsx`

**Interfaces:**
- Consumes `window.restx.knowledge`.
- Produces the `/knowledge` route and “知识图谱” navigation entry.
- `LayeredKnowledgeGraph` receives `KnowledgeGraph`, selected ID, and selection callback.
- `ClassificationDialog` emits a validated `ApplyKnowledgeClassificationInput`.

- [ ] **Step 1: Write failing page tests**

Cover initial scan, pending list, organized four-layer headings, selecting a problem, Markdown preview, AI suggestion, existing/new indicators, editable confirmation, apply refresh, invalid YAML, missing Provider, and empty root.

- [ ] **Step 2: Run page tests and verify RED**

Run: `pnpm vitest run tests/knowledge-map-page.test.tsx`

Expected: FAIL because the renderer feature does not exist.

- [ ] **Step 3: Implement page state and accessible workflows**

Load on mount, retain selected problem across refresh when possible, prevent concurrent scan/classify/apply operations, use status regions for errors, and keep other problems usable after a failure. Escape Markdown as plain text in a `<pre>` preview; do not inject rendered HTML.

- [ ] **Step 4: Implement layered graph and RestX-owned styling**

Render four labeled columns and pending shelf. Compute deterministic node slots and SVG cubic paths from measured/known column geometry; use visible `marker-end` arrowheads, neutral `--line` strokes, white panels, and `--accent` selection. At narrow widths, keep a minimum graph width inside horizontal overflow rather than overlapping labels.

- [ ] **Step 5: Implement organization dialog**

Display suggestion source fingerprint, one scene field, comma/newline-editable capability and knowledge fields, and existing/new chips. Disable confirmation for empty or out-of-bounds values and show file conflict/write errors without losing the suggestion.

- [ ] **Step 6: Run page tests and verify GREEN**

Run: `pnpm vitest run tests/knowledge-map-page.test.tsx tests/feature-platform.test.tsx`

Expected: PASS for the core user flow and route registration.

### Task 5: OpenSpec completion and comprehensive verification

**Files:**
- Modify: `openspec/changes/add-knowledge-map-feature/tasks.md`
- Modify only if verification reveals requirement wording gaps: `docs/superpowers/specs/2026-07-24-knowledge-map-feature-design.md`

**Interfaces:**
- Produces a completed OpenSpec task checklist and verification evidence.

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm test
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm typecheck
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm build
openspec validate add-knowledge-map-feature --strict
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 2: Start RestX and functionally verify**

Create bounded sample Markdown under a temporary HOME-backed knowledge root or test-owned RestX data directory, start Electron without conflicting with a user instance, and verify menu navigation, pending scan, preview, AI suggestion error/success state, confirmation, backup, writeback, and graph refresh.

- [ ] **Step 3: Perform final applicable independent verification**

Use isolated read-only verification contexts for automated checks, UI visual acceptance, and process smoke according to `AGENTS.md`. Record structured PASS/FAIL evidence. Do not package, sign, notarize, or install.

- [ ] **Step 4: Mark OpenSpec tasks complete and commit**

Update only completed task checkboxes, run `git diff --check`, and commit the cohesive feature implementation with a concise message.
