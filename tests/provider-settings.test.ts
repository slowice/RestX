import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AiProviderError } from '../src/platform/ai-provider/main/openai-client'
import {
  AiProviderRegistry,
  readClaudeCodeProviderConfig,
  type AiProviderCrypto,
  type AiProviderRegistryStorage,
  type ClaudeCodeConfig
} from '../src/platform/ai-provider/main/provider-registry'

class MemoryStorage implements AiProviderRegistryStorage {
  values = new Map<string, unknown>()
  get(key: string): unknown { return this.values.get(key) }
  set(key: string, value: unknown): void { this.values.set(key, structuredClone(value)) }
}

const crypto: AiProviderCrypto = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(`encrypted:${value}`).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString().replace('encrypted:', '')
}

const temporaryDirectories: string[] = []
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))))

describe('AiProviderRegistry', () => {
  it('creates multiple encrypted manual providers and switches the global active provider', async () => {
    const storage = new MemoryStorage()
    const registry = new AiProviderRegistry(storage, { crypto, readClaudeCode: async () => null })
    let state = await registry.create({ name: 'One', baseUrl: 'https://one.example/v1/', modelId: 'model-one', apiKey: 'top-secret-one' })
    state = await registry.create({ name: 'Two', baseUrl: 'https://two.example/v1', modelId: 'model-two', apiKey: 'top-secret-two' })
    expect(state.providers).toHaveLength(2)
    expect(JSON.stringify([...storage.values])).not.toContain('top-secret')
    expect(state.providers.every((provider) => !('apiKey' in provider))).toBe(true)

    const second = state.providers[1]
    state = await registry.setActive(second.id)
    expect(state.activeProviderId).toBe(second.id)
    expect((await registry.getActiveSecret()).modelId).toBe('model-two')
  })

  it('updates a manual provider without replacing its key when API Key is omitted', async () => {
    const registry = new AiProviderRegistry(new MemoryStorage(), { crypto, readClaudeCode: async () => null })
    const created = await registry.create({ name: 'Demo', baseUrl: 'https://one.example/v1', modelId: 'first', apiKey: 'key-one' })
    await registry.update({ id: created.activeProviderId!, name: 'Updated', baseUrl: 'https://two.example/v1', modelId: 'second' })
    expect(await registry.getActiveSecret()).toMatchObject({ name: 'Updated', baseUrl: 'https://two.example/v1', modelId: 'second', apiKey: 'key-one' })
  })

  it('normalizes custom headers, applies the last duplicate, and rejects unsafe values without changing saved headers', async () => {
    const registry = new AiProviderRegistry(new MemoryStorage(), { crypto, readClaudeCode: async () => null })
    const created = await registry.create({ name: 'Demo', baseUrl: 'https://one.example/v1', modelId: 'first', apiKey: 'key-one' })
    const state = await registry.setCustomHeaders(created.activeProviderId!, [
      { name: 'X-Gateway', value: 'first' },
      { name: 'authorization', value: 'Gateway token' },
      { name: 'X-Gateway', value: 'last' },
      { name: '', value: '' }
    ])
    expect(state.providers[0].customHeaders).toEqual({ 'X-Gateway': 'last', authorization: 'Gateway token' })
    await expect(registry.setCustomHeaders(created.activeProviderId!, [{ name: 'X-Bad', value: 'line\nbreak' }])).rejects.toMatchObject({ code: 'INVALID_SETTINGS' })
    expect((await registry.getState()).providers[0].customHeaders).toEqual({ 'X-Gateway': 'last', authorization: 'Gateway token' })
  })

  it('imports Claude Code once, defaults the model, and does not persist its token', async () => {
    const storage = new MemoryStorage()
    let config: ClaudeCodeConfig = { sourcePath: '/Users/demo/.claude/settings.json', baseUrl: 'https://claude.example/v1', modelId: 'GLM5.1', apiKey: 'rotating-token', fileSignature: '1:100' }
    const registry = new AiProviderRegistry(storage, { crypto, readClaudeCode: async () => config })
    await registry.initialize()
    await registry.initialize()
    let state = await registry.getState()
    expect(state.providers).toHaveLength(1)
    expect(state.providers[0]).toMatchObject({ source: 'claude-code', modelId: 'GLM5.1', active: true, useSystemProxy: false })
    expect(JSON.stringify([...storage.values])).not.toContain('rotating-token')

    await registry.setSystemProxy(state.providers[0].id, true)
    config = { ...config, fileSignature: '2:100' }
    state = await registry.refreshExternal()
    expect(state.providers[0].useSystemProxy).toBe(true)
  })

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

  it('refreshes a rotating Claude token and retries authentication only once', async () => {
    let config: ClaudeCodeConfig = { sourcePath: '/Users/demo/.claude/settings.json', baseUrl: 'https://claude.example/v1', modelId: 'demo', apiKey: 'token-one', fileSignature: '1:100' }
    const registry = new AiProviderRegistry(new MemoryStorage(), { crypto, readClaudeCode: async () => config })
    const attemptedKeys: string[] = []
    const result = await registry.executeActive(async ({ provider }) => {
      attemptedKeys.push(provider.apiKey)
      if (attemptedKeys.length === 1) {
        config = { ...config, apiKey: 'token-two', fileSignature: '2:100' }
        throw new AiProviderError('expired', 'AUTHENTICATION_FAILED')
      }
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(attemptedKeys).toEqual(['token-one', 'token-two'])
  })

  it('keeps RestX-managed headers when Claude Code configuration refreshes', async () => {
    let config: ClaudeCodeConfig = { sourcePath: '/Users/demo/.claude/settings.json', baseUrl: 'https://claude.example/v1', modelId: 'demo', apiKey: 'token-one', fileSignature: '1:100' }
    const registry = new AiProviderRegistry(new MemoryStorage(), { crypto, readClaudeCode: async () => config })
    const initial = await registry.getState()
    await registry.setCustomHeaders(initial.providers[0].id, [{ name: 'X-Gateway', value: 'restx' }])
    config = { ...config, modelId: 'updated', apiKey: 'token-two', fileSignature: '2:100' }
    const refreshed = await registry.refreshExternal()
    expect(refreshed.providers[0]).toMatchObject({ modelId: 'updated', customHeaders: { 'X-Gateway': 'restx' } })
  })

  it('migrates and deduplicates legacy providers without deleting legacy data', async () => {
    const encrypted = crypto.encrypt('same-key')
    const storage = new MemoryStorage()
    const registry = new AiProviderRegistry(storage, {
      crypto,
      readClaudeCode: async () => null,
      readLegacyProviders: () => [
        { name: '原 AI 配置', baseUrl: 'https://example.com/v1', modelId: 'demo', encryptedApiKey: encrypted, preferred: true },
        { name: '原 Review 配置', baseUrl: 'https://example.com/v1/', modelId: 'demo', encryptedApiKey: encrypted }
      ]
    })
    const state = await registry.getState()
    expect(state.providers).toHaveLength(1)
    expect(state.activeProviderId).toBe(state.providers[0].id)
    expect(storage.get('migrationVersion')).toBe(1)
  })
})

describe('readClaudeCodeProviderConfig', () => {
  it('reads whitelisted env fields and falls back to GLM5.1 without exposing unrelated values', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'restx-claude-provider-'))
    temporaryDirectories.push(root)
    const file = path.join(root, 'settings.json')
    await writeFile(file, JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://example.com/v1', ANTHROPIC_AUTH_TOKEN: 'token', UNRELATED_SECRET: 'ignore' } }))
    const config = await readClaudeCodeProviderConfig(file)
    expect(config).toMatchObject({ sourcePath: file, baseUrl: 'https://example.com/v1', modelId: 'GLM5.1', apiKey: 'token' })
    expect(config).not.toHaveProperty('UNRELATED_SECRET')
  })
})
