import { afterEach, describe, expect, it } from 'vitest'
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

  it('imports Claude Code once, defaults the model, and does not persist its token', async () => {
    const storage = new MemoryStorage()
    const config: ClaudeCodeConfig = { sourcePath: '/Users/demo/.claude/settings.json', baseUrl: 'https://claude.example/v1', modelId: 'GLM5.1', apiKey: 'rotating-token', fileSignature: '1:100' }
    const registry = new AiProviderRegistry(storage, { crypto, readClaudeCode: async () => config })
    await registry.initialize()
    await registry.initialize()
    const state = await registry.getState()
    expect(state.providers).toHaveLength(1)
    expect(state.providers[0]).toMatchObject({ source: 'claude-code', modelId: 'GLM5.1', active: true })
    expect(JSON.stringify([...storage.values])).not.toContain('rotating-token')
  })

  it('refreshes a rotating Claude token and retries authentication only once', async () => {
    let config: ClaudeCodeConfig = { sourcePath: '/Users/demo/.claude/settings.json', baseUrl: 'https://claude.example/v1', modelId: 'demo', apiKey: 'token-one', fileSignature: '1:100' }
    const registry = new AiProviderRegistry(new MemoryStorage(), { crypto, readClaudeCode: async () => config })
    const attemptedKeys: string[] = []
    const result = await registry.executeActive(async (provider) => {
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
