# Provider System Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan as one concentrated phase. Do not create per-task commits or checkpoints in the requirement worktree; RestX integrates and commits only from local `main`.

**Goal:** Add a per-Provider switch that routes every AI request through the operating system proxy when enabled.

**Architecture:** Persist `useSystemProxy` in the platform Provider registry and expose a narrow update API. The registry passes an `AiProviderExecutionContext` containing both the resolved Provider and the selected request function; direct Providers receive Node.js `fetch`, while proxied Providers receive Electron `net.fetch`. All AI features consume that injected function so connection tests and real requests cannot diverge.

**Tech Stack:** Electron 39 `net.fetch`, React 19, TypeScript 5.7, Vitest, Testing Library, electron-store.

## Global Constraints

- Work only in `/Users/xubin/xb/Work Stattion/RestX/.worktrees/provider-system-proxy` until verified integration to local `main`.
- Keep the capability in blue-zone `src/platform/ai-provider/`; feature code only consumes its public execution context.
- All existing and newly created Providers default to direct networking.
- Manual and external Providers can independently change the RestX-owned proxy preference.
- Never log or expose API keys, proxy addresses, PAC contents, or proxy authentication data.
- Proxy failure must not silently fall back to the direct Node.js request path.
- Do not add a proxy dependency; use Electron's Chromium-backed `net.fetch`.
- Keep tests lean: one regression test may cover multiple closely related invariants.
- Run pnpm without inherited proxy variables and with `https://registry.npmmirror.com`.

---

### Task 1: Provider preference and request context

**Files:**
- Modify: `src/platform/ai-provider/shared/contracts.ts`
- Modify: `src/platform/ai-provider/main/provider-registry.ts`
- Test: `tests/provider-settings.test.ts`

**Interfaces:**
- Produces: `AiProviderExecutionContext = { provider: ResolvedAiProvider; fetch: typeof fetch }`
- Produces: `AiProviderRegistry.setSystemProxy(id: string, enabled: boolean): Promise<AiProviderState>`
- Produces: execution callbacks shaped as `(context: AiProviderExecutionContext) => Promise<T>`
- Consumes: injected `fetchImpl?: typeof fetch` for direct requests and `systemFetchImpl?: typeof fetch` for proxied requests.

- [ ] **Step 1: Add a failing registry regression test**

Extend the registry suite with one test that creates a manual Provider, verifies `useSystemProxy === false`, records its `identityFingerprint`, toggles the preference, and executes one callback before and after the toggle:

```ts
it('persists an independent system proxy preference and injects the matching request function', async () => {
  const directFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }))
  const systemFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }))
  const registry = new AiProviderRegistry(new MemoryStorage(), {
    crypto,
    readClaudeCode: async () => null,
    fetchImpl: directFetch,
    systemFetchImpl: systemFetch
  })
  const created = await registry.create({
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelId: 'gemini',
    apiKey: 'secret'
  })
  const id = created.activeProviderId!
  expect(created.providers[0].useSystemProxy).toBe(false)
  const fingerprint = created.providers[0].identityFingerprint

  await registry.executeActive(({ fetch }) => fetch('https://example.test/direct'))
  const updated = await registry.setSystemProxy(id, true)
  await registry.executeActive(({ fetch }) => fetch('https://example.test/proxy'))

  expect(updated.providers[0]).toMatchObject({ useSystemProxy: true, identityFingerprint: fingerprint })
  expect(directFetch).toHaveBeenCalledTimes(1)
  expect(systemFetch).toHaveBeenCalledTimes(1)
})
```

Also extend the existing Claude import test: after setting its preference to `true`, refresh the external config and assert it remains `true`.

- [ ] **Step 2: Run the targeted test and confirm the contract is missing**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/provider-settings.test.ts
```

Expected: TypeScript/runtime failures for `useSystemProxy`, `systemFetchImpl`, `setSystemProxy`, and the new execution callback shape.

- [ ] **Step 3: Add the shared types and compatible storage behavior**

Add to `AiProviderPublic` and `ResolvedAiProvider`:

```ts
useSystemProxy: boolean
```

Add:

```ts
export type AiProviderExecutionContext = {
  provider: ResolvedAiProvider
  fetch: typeof fetch
}
```

In `StoredProvider`, use `useSystemProxy?: boolean` so old JSON remains readable. New manual and first-time external records store `false`; public and resolved values use `provider.useSystemProxy === true`. When rebuilding an external Provider, preserve `providers[index].useSystemProxy === true`. Do not include the field in `identityFingerprint`.

- [ ] **Step 4: Implement the narrow update and transport selection**

Add registry dependencies and method:

```ts
type RegistryDependencies = {
  // existing dependencies
  fetchImpl?: typeof fetch
  systemFetchImpl?: typeof fetch
}

async setSystemProxy(id: string, enabled: boolean): Promise<AiProviderState> {
  await this.initialize()
  const providers = this.providers()
  const index = providers.findIndex((provider) => provider.id === id)
  if (index < 0) throw new AiProviderError('Provider 不存在。', 'NOT_FOUND')
  providers[index] = {
    ...providers[index],
    useSystemProxy: enabled,
    updatedAt: this.now().toISOString()
  }
  this.storage.set('providers', providers)
  return this.publicState()
}
```

Change `execute`/`executeActive` callbacks to accept `AiProviderExecutionContext`. Resolve the Provider first, then choose:

```ts
private executionContext(provider: ResolvedAiProvider): AiProviderExecutionContext {
  return {
    provider,
    fetch: provider.useSystemProxy
      ? this.dependencies.systemFetchImpl ?? systemFetch
      : this.dependencies.fetchImpl ?? fetch
  }
}
```

Import Electron `net` and define the default without losing method binding:

```ts
const systemFetch: typeof fetch = (input, init) => net.fetch(input, init)
```

Use the same context for the Claude authentication refresh retry. Change Provider connection testing to call `testOpenAiProvider(provider, context.fetch)`.

- [ ] **Step 5: Run the targeted registry test**

Run the Task 1 command again.

Expected: all `provider-settings` tests pass, including direct/proxy selection and external refresh preservation.

---

### Task 2: Make all AI consumers use the selected transport

**Files:**
- Modify: `src/features/ai-inspector/main/register.ts`
- Modify: `src/features/ai-inspector/main/services/smart-preset-import.ts`
- Modify: `src/features/code-review/main/services/code-review-service.ts`
- Modify: `src/features/knowledge-map/main/knowledge-service.ts`
- Modify: affected test callbacks in `tests/provider-settings.test.ts`, `tests/code-review-core.test.ts`, `tests/knowledge-classification.test.ts`, and `tests/knowledge-map-api.test.ts`

**Interfaces:**
- Consumes: `AiProviderExecutionContext` from Task 1.
- Produces: every production Provider call passes `context.fetch` to its existing request service as `fetchImpl`.

- [ ] **Step 1: Let TypeScript identify every stale callback**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm typecheck
```

Expected: failures at callbacks still reading `provider.baseUrl`, `provider.apiKey`, or the old callback type.

- [ ] **Step 2: Update AI Inspector analysis and smart import**

Use:

```ts
aiProviderRegistry.execute(providerId, async ({ provider, fetch }) => ({
  result: await analyzeWithOpenAiCompatible({
    settings: { baseUrl: provider.baseUrl, model: provider.modelId, apiKey: provider.apiKey },
    document,
    fetchImpl: fetch,
    logger: aiCallLogger
  }),
  modelId: provider.modelId
}))
```

For smart import, let the local request helper accept an optional request function and pass the injected function:

```ts
const request = (settings: ProviderSecretSettings, fetchImpl = dependencies.fetchImpl) =>
  requestDraft({ settings, userPayload, fetchImpl, logger: dependencies.logger })

await aiProviderRegistry.executeActive(({ provider, fetch }) =>
  request({ baseUrl: provider.baseUrl, model: provider.modelId, apiKey: provider.apiKey }, fetch)
)
```

- [ ] **Step 3: Update Code Review and Knowledge Map**

Change the Code Review provider dependency callback type to `AiProviderExecutionContext` and invoke:

```ts
this.providers.execute(provider.id, ({ provider: resolved, fetch }) =>
  reviewCodeBatch({
    settings: { baseUrl: resolved.baseUrl, model: resolved.modelId, apiKey: resolved.apiKey },
    batch,
    rulePacks,
    requirements: input.requirements,
    sourceSummary,
    fetchImpl: fetch
  })
)
```

Change `KnowledgeService`'s `ExecuteActive` type and classification callback:

```ts
return this.dependencies.executeActive(({ provider, fetch }) =>
  classifyKnowledgeProblem({
    problemId,
    sourceFingerprint: parsed.summary.sourceFingerprint,
    markdown: parsed.body,
    catalog: result.catalog,
    provider,
    fetchImpl: this.dependencies.fetchImpl ?? fetch
  })
)
```

Update existing test doubles to call callbacks with `{ provider, fetch }`. Preserve explicit test injection by preferring `dependencies.fetchImpl` in Knowledge Map.

- [ ] **Step 4: Run targeted business tests**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/config-analysis-service.test.ts tests/smart-preset-import.test.ts tests/code-review-core.test.ts tests/knowledge-classification.test.ts tests/knowledge-map-api.test.ts
```

Expected: all targeted AI feature tests pass.

---

### Task 3: Expose and render the Provider switch

**Files:**
- Modify: `src/platform/ai-provider/shared/contracts.ts`
- Modify: `src/platform/shared/platform-api.ts`
- Modify: `src/platform/preload/expose-api.ts`
- Modify: `src/platform/main/register-platform.ts`
- Modify: `src/features/settings/renderer/SettingsPage.tsx`
- Modify: `src/features/settings/renderer/settings.css`
- Test: `tests/preload-api.test.ts`
- Create: `tests/settings-page.test.tsx`

**Interfaces:**
- Produces: `providers.setSystemProxy(id: string, enabled: boolean): Promise<AiProviderState>`
- Produces: IPC channel `platform:ai-provider:set-system-proxy`
- Consumes: `AiProviderRegistry.setSystemProxy`.

- [ ] **Step 1: Add failing preload and UI tests**

In `tests/preload-api.test.ts`, call:

```ts
await api.providers.setSystemProxy('provider-1', true)
```

and assert the fixed channel receives `('provider-1', true)`.

Create one Settings test that mocks `useInspectorState` and `CodeReviewSettingsSection`, installs two Providers (one manual, one `claude-code`), renders `SettingsPage`, clicks the external Provider switch by accessible name, and asserts:

```ts
expect(api.providers.setSystemProxy).toHaveBeenCalledWith('claude-1', true)
```

This single test proves the switch is visible for both ownership models and the external Provider can change only its RestX-owned route preference.

- [ ] **Step 2: Run the targeted UI/API tests and confirm failure**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/preload-api.test.ts tests/settings-page.test.tsx
```

Expected: failures because the API method, channel, and switch do not exist.

- [ ] **Step 3: Add the narrow IPC and preload method**

Add the method to `AiProviderApi`, a `setProviderSystemProxy` channel, and the preload mapping:

```ts
setSystemProxy: (id, enabled) =>
  invoke(platformChannels.setProviderSystemProxy, id, enabled)
```

Register the handler with validation:

```ts
ipc.handle(platformChannels.setProviderSystemProxy, (_event, id: unknown, enabled: unknown) => {
  assertId(id)
  if (typeof enabled !== 'boolean') throw new Error('系统代理参数无效。')
  return aiProviderRegistry.setSystemProxy(id, enabled)
})
```

- [ ] **Step 4: Add the card switch**

Add a handler that uses busy key `proxy:${provider.id}`, calls the API, updates state, and displays “已开启/关闭系统代理” success text. Render in every card action area:

```tsx
<div className="provider-proxy-control">
  <span>系统代理</span>
  <button
    type="button"
    role="switch"
    aria-label={`为 ${provider.name} 使用系统代理`}
    aria-checked={provider.useSystemProxy}
    className={`switch compact-switch ${provider.useSystemProxy ? 'on' : ''}`}
    disabled={busy !== null}
    onClick={() => void setSystemProxy(provider)}
  >
    <span />
  </button>
</div>
```

Add focused CSS so the label and compact switch fit the existing `provider-card-actions` layout without changing unrelated Settings sections.

- [ ] **Step 5: Run the targeted UI/API tests**

Run the Task 3 test command again.

Expected: both files pass.

---

### Task 4: Consolidated verification and OpenSpec state

**Files:**
- Modify: `openspec/changes/add-provider-system-proxy/tasks.md`
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: complete implementation.
- Produces: stable local checkpoint for independent verification tasks.

- [ ] **Step 1: Mark completed implementation tasks**

Change OpenSpec implementation checkboxes 1.1 through 3.3 to `[x]`; leave independent validation and integration tasks open.

- [ ] **Step 2: Run one local targeted confidence pass**

Run:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy /usr/local/bin/pnpm exec vitest run tests/provider-settings.test.ts tests/preload-api.test.ts tests/settings-page.test.tsx tests/config-analysis-service.test.ts tests/smart-preset-import.test.ts tests/code-review-core.test.ts tests/knowledge-classification.test.ts tests/knowledge-map-api.test.ts
git diff --check
```

Expected: all targeted tests pass and `git diff --check` prints no output.

- [ ] **Step 3: Self-review the complete diff**

Confirm:

- `rg -n "useSystemProxy|setSystemProxy|AiProviderExecutionContext" src tests` shows the field only in platform contracts, registry, Settings, and explicit consumers.
- `rg -n "proxy|PAC" src/platform/ai-provider/main` shows no logging of resolved proxy details.
- Every `aiProviderRegistry.execute` and `executeActive` callback receives the execution context and passes its `fetch`.
- `git status --short` contains only this requirement's docs, OpenSpec, source, and tests.

- [ ] **Step 4: Hand off to independent validation**

Create a stable local checkpoint without committing in the worktree. Dispatch only the applicable independent tasks:

- Automated: `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`.
- Visual: Provider list with proxy switches at supported window sizes, including manual and external cards.
- Process smoke: application start, main window load, main process survival, and clean exit, only when no user RestX instance is using `~/.restx/runtime`.

After all applicable tasks return structured `PASS`, request one final code review of the complete diff. Fix findings in the main development task, rerun only affected checks, integrate to local `main`, commit, push, and remove the requirement worktree and branch.
