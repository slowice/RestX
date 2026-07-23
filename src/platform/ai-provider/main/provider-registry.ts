import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeStorage } from 'electron'
import Store from 'electron-store'
import type {
  AiProviderPublic,
  AiProviderState,
  AiProviderTestResult,
  CreateAiProviderInput,
  ResolvedAiProvider,
  UpdateAiProviderInput
} from '../shared/contracts'
import { AiProviderError, normalizeAiBaseUrl, testOpenAiProvider } from './openai-client'

const STORE_VERSION = 1
const DEFAULT_MODEL_ID = 'GLM5.1'

type StoredProvider = {
  id: string
  name: string
  source: 'manual' | 'claude-code'
  baseUrl: string
  modelId: string
  encryptedApiKey?: string
  sourcePath?: string
  available?: boolean
  statusMessage?: string
  createdAt: string
  updatedAt: string
}

type StoreShape = {
  version: number
  migrationVersion: number
  activeProviderId: string | null
  fingerprintKey: string
  providers: StoredProvider[]
}

export interface AiProviderRegistryStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface AiProviderCrypto {
  isAvailable(): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

export type ClaudeCodeConfig = {
  sourcePath: string
  baseUrl: string
  modelId: string
  apiKey: string
  fileSignature: string
}

type LegacyProvider = {
  name: string
  baseUrl: string
  modelId: string
  encryptedApiKey: string
  preferred?: boolean
}

type RegistryDependencies = {
  crypto: AiProviderCrypto
  readClaudeCode(): Promise<ClaudeCodeConfig | null>
  readLegacyProviders?(): LegacyProvider[]
  now?: () => Date
  fetchImpl?: typeof fetch
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new AiProviderError(`${field} 无效。`, 'INVALID_SETTINGS')
  return normalized
}

function errorCode(reason: unknown): string | undefined {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string' ? reason.code : undefined
}

export class AiProviderRegistry {
  private initialized = false
  private externalCache: { fileSignature: string; credentialFingerprint: string; apiKey: string } | null = null

  constructor(private readonly storage: AiProviderRegistryStorage, private readonly dependencies: RegistryDependencies) {}

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.ensureFingerprintKey()
    this.migrateLegacyProviders()
    await this.refreshClaudeCode(true)
    this.initialized = true
  }

  async getState(): Promise<AiProviderState> {
    await this.initialize()
    await this.refreshClaudeCode(false)
    return this.publicState()
  }

  async create(input: CreateAiProviderInput): Promise<AiProviderState> {
    await this.initialize()
    const apiKey = requiredText(input.apiKey, 'API Key', 20_000)
    if (!this.dependencies.crypto.isAvailable()) throw new AiProviderError('当前系统安全存储不可用，无法安全保存 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
    const now = this.now().toISOString()
    const provider: StoredProvider = {
      id: `provider-${randomUUID()}`,
      name: requiredText(input.name, 'Provider 名称', 120),
      source: 'manual',
      baseUrl: normalizeAiBaseUrl(input.baseUrl),
      modelId: requiredText(input.modelId, '模型 ID', 300),
      encryptedApiKey: this.dependencies.crypto.encrypt(apiKey),
      createdAt: now,
      updatedAt: now
    }
    const providers = [...this.providers(), provider]
    this.storage.set('providers', providers)
    if (!this.activeProviderId()) this.storage.set('activeProviderId', provider.id)
    return this.publicState()
  }

  async update(input: UpdateAiProviderInput): Promise<AiProviderState> {
    await this.initialize()
    const providers = this.providers()
    const index = providers.findIndex((provider) => provider.id === input.id)
    if (index < 0) throw new AiProviderError('Provider 不存在。', 'NOT_FOUND')
    const current = providers[index]
    if (current.source !== 'manual') throw new AiProviderError('自动导入的 Provider 由外部配置管理，不能在 RestX 中编辑。', 'READ_ONLY')
    let encryptedApiKey = current.encryptedApiKey
    if (input.apiKey !== undefined && input.apiKey.trim()) {
      if (!this.dependencies.crypto.isAvailable()) throw new AiProviderError('当前系统安全存储不可用，无法安全保存 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
      encryptedApiKey = this.dependencies.crypto.encrypt(requiredText(input.apiKey, 'API Key', 20_000))
    }
    providers[index] = {
      ...current,
      name: requiredText(input.name, 'Provider 名称', 120),
      baseUrl: normalizeAiBaseUrl(input.baseUrl),
      modelId: requiredText(input.modelId, '模型 ID', 300),
      encryptedApiKey,
      updatedAt: this.now().toISOString()
    }
    this.storage.set('providers', providers)
    return this.publicState()
  }

  async delete(id: string): Promise<AiProviderState> {
    await this.initialize()
    const provider = this.find(id)
    if (provider.source !== 'manual') throw new AiProviderError('自动导入的 Provider 不能删除。', 'READ_ONLY')
    const providers = this.providers().filter((item) => item.id !== id)
    this.storage.set('providers', providers)
    if (this.activeProviderId() === id) this.storage.set('activeProviderId', providers.find((item) => this.isReady(item))?.id ?? null)
    return this.publicState()
  }

  async setActive(id: string): Promise<AiProviderState> {
    await this.initialize()
    const provider = this.find(id)
    if (!this.isReady(provider)) throw new AiProviderError('该 Provider 当前不可用。', 'PROVIDER_UNAVAILABLE')
    this.storage.set('activeProviderId', id)
    return this.publicState()
  }

  async test(id: string): Promise<AiProviderTestResult> {
    await this.initialize()
    const startedAt = Date.now()
    try {
      await this.executeProvider(id, (provider) => testOpenAiProvider(provider, this.dependencies.fetchImpl))
      return { ok: true, message: '连接成功，OpenAI-compatible 响应正常。', durationMs: Date.now() - startedAt }
    } catch (reason) {
      return { ok: false, message: reason instanceof Error ? reason.message : '连接测试失败。', durationMs: Date.now() - startedAt }
    }
  }

  async refreshExternal(): Promise<AiProviderState> {
    await this.initialize()
    await this.refreshClaudeCode(true)
    return this.publicState()
  }

  async getActivePublic(): Promise<AiProviderPublic> {
    const state = await this.getState()
    const provider = state.providers.find((item) => item.id === state.activeProviderId)
    if (!provider || provider.status !== 'ready') throw new AiProviderError('请先新增并选择一个可用的 AI Provider。', 'INVALID_SETTINGS')
    return provider
  }

  async getActiveSecret(): Promise<ResolvedAiProvider> {
    await this.initialize()
    const id = this.activeProviderId()
    if (!id) throw new AiProviderError('请先新增并选择一个 AI Provider。', 'INVALID_SETTINGS')
    return this.resolveSecret(this.find(id), false)
  }

  async executeActive<T>(operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T> {
    await this.initialize()
    const id = this.activeProviderId()
    if (!id) throw new AiProviderError('请先新增并选择一个 AI Provider。', 'INVALID_SETTINGS')
    return this.executeProvider(id, operation)
  }

  async execute<T>(id: string, operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T> {
    await this.initialize()
    return this.executeProvider(id, operation)
  }

  private async executeProvider<T>(id: string, operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T> {
    const stored = this.find(id)
    const first = await this.resolveSecret(stored, false)
    try {
      return await operation(first)
    } catch (reason) {
      if (stored.source !== 'claude-code' || errorCode(reason) !== 'AUTHENTICATION_FAILED') throw reason
      const refreshed = await this.resolveSecret(stored, true)
      if (refreshed.credentialFingerprint === first.credentialFingerprint) throw reason
      return operation(refreshed)
    }
  }

  private async resolveSecret(provider: StoredProvider, forceExternal: boolean): Promise<ResolvedAiProvider> {
    let apiKey: string
    let credentialFingerprint: string
    if (provider.source === 'claude-code') {
      await this.refreshClaudeCode(forceExternal)
      const refreshed = this.find(provider.id)
      if (!this.isReady(refreshed) || !this.externalCache) throw new AiProviderError('Claude Code Provider 当前不可用，请检查 ~/.claude/settings.json。', 'PROVIDER_UNAVAILABLE')
      provider = refreshed
      apiKey = this.externalCache.apiKey
      credentialFingerprint = this.externalCache.credentialFingerprint
    } else {
      if (!provider.encryptedApiKey) throw new AiProviderError('Provider 尚未配置 API Key。', 'INVALID_SETTINGS')
      if (!this.dependencies.crypto.isAvailable()) throw new AiProviderError('当前系统安全存储不可用，无法读取 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
      try { apiKey = this.dependencies.crypto.decrypt(provider.encryptedApiKey) } catch { throw new AiProviderError('保存的 API Key 无法解密，请重新设置。', 'KEY_DECRYPTION_FAILED') }
      credentialFingerprint = this.credentialFingerprint(apiKey)
    }
    return {
      id: provider.id,
      name: provider.name,
      source: provider.source,
      baseUrl: provider.baseUrl,
      modelId: provider.modelId,
      apiKey,
      identityFingerprint: this.identityFingerprint(provider),
      credentialFingerprint
    }
  }

  private async refreshClaudeCode(force: boolean): Promise<void> {
    const config = await this.dependencies.readClaudeCode().catch(() => null)
    const providers = this.providers()
    const index = providers.findIndex((provider) => provider.source === 'claude-code')
    if (!config) {
      if (index >= 0 && providers[index].available !== false) {
        providers[index] = { ...providers[index], available: false, statusMessage: '未读取到可用的 Claude Code 配置', updatedAt: this.now().toISOString() }
        this.storage.set('providers', providers)
      }
      this.externalCache = null
      return
    }
    if (!force && this.externalCache?.fileSignature === config.fileSignature) return
    const credentialFingerprint = this.credentialFingerprint(config.apiKey)
    this.externalCache = { fileSignature: config.fileSignature, credentialFingerprint, apiKey: config.apiKey }
    const now = this.now().toISOString()
    const next: StoredProvider = {
      id: index >= 0 ? providers[index].id : `claude-code-${createHash('sha256').update(path.resolve(config.sourcePath)).digest('hex').slice(0, 12)}`,
      name: 'Claude Code',
      source: 'claude-code',
      baseUrl: normalizeAiBaseUrl(config.baseUrl),
      modelId: config.modelId.trim() || DEFAULT_MODEL_ID,
      sourcePath: path.resolve(config.sourcePath),
      available: true,
      createdAt: index >= 0 ? providers[index].createdAt : now,
      updatedAt: now
    }
    if (index >= 0) providers[index] = next
    else providers.push(next)
    this.storage.set('providers', providers)
    if (!this.activeProviderId()) this.storage.set('activeProviderId', next.id)
  }

  private migrateLegacyProviders(): void {
    if (Number(this.storage.get('migrationVersion') ?? 0) >= STORE_VERSION) return
    const legacy = this.dependencies.readLegacyProviders?.() ?? []
    const providers = this.providers()
    const seen = new Set<string>()
    for (const provider of providers) seen.add(this.legacyIdentity(provider.baseUrl, provider.modelId, provider.encryptedApiKey))
    let preferredId: string | null = null
    for (const item of legacy) {
      if (!item.modelId.trim() || !item.encryptedApiKey) continue
      let baseUrl: string
      try { baseUrl = normalizeAiBaseUrl(item.baseUrl) } catch { continue }
      const identity = this.legacyIdentity(baseUrl, item.modelId, item.encryptedApiKey)
      if (seen.has(identity)) continue
      const now = this.now().toISOString()
      const stored: StoredProvider = {
        id: `provider-${randomUUID()}`,
        name: item.name,
        source: 'manual',
        baseUrl,
        modelId: item.modelId.trim(),
        encryptedApiKey: item.encryptedApiKey,
        createdAt: now,
        updatedAt: now
      }
      providers.push(stored)
      seen.add(identity)
      if (item.preferred) preferredId = stored.id
    }
    this.storage.set('providers', providers)
    if (!this.activeProviderId()) this.storage.set('activeProviderId', preferredId ?? providers.find((provider) => this.isReady(provider))?.id ?? null)
    this.storage.set('migrationVersion', STORE_VERSION)
    this.storage.set('version', STORE_VERSION)
  }

  private legacyIdentity(baseUrl: string, modelId: string, encryptedApiKey?: string): string {
    let secretPart = encryptedApiKey ?? ''
    if (encryptedApiKey && this.dependencies.crypto.isAvailable()) {
      try { secretPart = this.credentialFingerprint(this.dependencies.crypto.decrypt(encryptedApiKey)) } catch { /* retain opaque encrypted material */ }
    }
    return createHash('sha256').update(`${baseUrl}\0${modelId.trim()}\0${secretPart}`).digest('hex')
  }

  private publicState(): AiProviderState {
    const activeProviderId = this.activeProviderId()
    const providers = this.providers().map((provider): AiProviderPublic => {
      const ready = this.isReady(provider)
      return {
        id: provider.id,
        name: provider.name,
        source: provider.source,
        baseUrl: provider.baseUrl,
        modelId: provider.modelId,
        apiKeyConfigured: provider.source === 'claude-code' ? provider.available === true : Boolean(provider.encryptedApiKey),
        status: ready ? 'ready' : provider.source === 'claude-code' ? 'unavailable' : 'incomplete',
        ...(provider.statusMessage ? { statusMessage: provider.statusMessage } : {}),
        active: provider.id === activeProviderId,
        editable: provider.source === 'manual',
        identityFingerprint: this.identityFingerprint(provider)
      }
    })
    return { providers, activeProviderId: providers.some((provider) => provider.id === activeProviderId) ? activeProviderId : null }
  }

  private providers(): StoredProvider[] {
    const value = this.storage.get('providers')
    return Array.isArray(value) ? value.filter((provider): provider is StoredProvider => Boolean(provider) && typeof provider === 'object' && typeof provider.id === 'string') : []
  }

  private activeProviderId(): string | null {
    const value = this.storage.get('activeProviderId')
    return typeof value === 'string' && value ? value : null
  }

  private find(id: string): StoredProvider {
    const provider = this.providers().find((item) => item.id === id)
    if (!provider) throw new AiProviderError('Provider 不存在。', 'NOT_FOUND')
    return provider
  }

  private isReady(provider: StoredProvider): boolean {
    return Boolean(provider.baseUrl && provider.modelId && (provider.source === 'claude-code' ? provider.available : provider.encryptedApiKey))
  }

  private identityFingerprint(provider: StoredProvider): string {
    return createHash('sha256').update(`${provider.id}\0${provider.baseUrl}\0${provider.modelId}`).digest('hex')
  }

  private credentialFingerprint(apiKey: string): string {
    return createHmac('sha256', this.ensureFingerprintKey()).update(apiKey).digest('hex')
  }

  private ensureFingerprintKey(): string {
    const current = this.storage.get('fingerprintKey')
    if (typeof current === 'string' && current.length >= 32) return current
    const generated = randomBytes(32).toString('base64')
    this.storage.set('fingerprintKey', generated)
    return generated
  }

  private now(): Date { return this.dependencies.now?.() ?? new Date() }
}

export async function readClaudeCodeProviderConfig(settingsPath = path.join(os.homedir(), '.claude', 'settings.json')): Promise<ClaudeCodeConfig | null> {
  let raw: string
  let stat
  try {
    [raw, stat] = await Promise.all([fs.readFile(settingsPath, 'utf8'), fs.stat(settingsPath)])
  } catch { return null }
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const env = (value as { env?: unknown }).env
  if (!env || typeof env !== 'object' || Array.isArray(env)) return null
  const record = env as Record<string, unknown>
  const read = (key: string): string => typeof record[key] === 'string' ? (record[key] as string).trim() : ''
  const baseUrl = read('ANTHROPIC_BASE_URL')
  const apiKey = read('ANTHROPIC_AUTH_TOKEN') || read('ANTHROPIC_API_KEY')
  if (!baseUrl || !apiKey) return null
  const modelId = read('ANTHROPIC_MODEL') || read('ANTHROPIC_DEFAULT_SONNET_MODEL') || DEFAULT_MODEL_ID
  return {
    sourcePath: settingsPath,
    baseUrl,
    modelId,
    apiKey,
    fileSignature: `${stat.mtimeMs}:${stat.size}`
  }
}

function readLegacyStore(name: string, label: string, preferred = false): LegacyProvider | null {
  const store = new Store<Record<string, unknown>>({ name })
  const baseUrl = store.get('baseUrl')
  const modelId = store.get('model')
  const encryptedApiKey = store.get('encryptedApiKey')
  if (typeof baseUrl !== 'string' || typeof modelId !== 'string' || typeof encryptedApiKey !== 'string') return null
  return { name: label, baseUrl, modelId, encryptedApiKey, preferred }
}

let registryInstance: AiProviderRegistry | null = null

function createDefaultRegistry(): AiProviderRegistry {
  const store = new Store<StoreShape>({
    name: 'ai-providers',
    defaults: { version: STORE_VERSION, migrationVersion: 0, activeProviderId: null, fingerprintKey: '', providers: [] }
  })
  const crypto: AiProviderCrypto = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  return new AiProviderRegistry(store, {
    crypto,
    readClaudeCode: () => readClaudeCodeProviderConfig(),
    readLegacyProviders: () => [
      readLegacyStore('ai-provider', '原 AI 配置', true),
      readLegacyStore('code-review-provider-blue', '原代码 Review 配置 1'),
      readLegacyStore('code-review-provider-yellow', '原代码 Review 配置 2')
    ].filter((provider): provider is LegacyProvider => provider !== null)
  })
}

export const aiProviderRegistry = {
  initialize: (): Promise<void> => (registryInstance ??= createDefaultRegistry()).initialize(),
  getState: (): Promise<AiProviderState> => (registryInstance ??= createDefaultRegistry()).getState(),
  create: (input: CreateAiProviderInput): Promise<AiProviderState> => (registryInstance ??= createDefaultRegistry()).create(input),
  update: (input: UpdateAiProviderInput): Promise<AiProviderState> => (registryInstance ??= createDefaultRegistry()).update(input),
  delete: (id: string): Promise<AiProviderState> => (registryInstance ??= createDefaultRegistry()).delete(id),
  setActive: (id: string): Promise<AiProviderState> => (registryInstance ??= createDefaultRegistry()).setActive(id),
  test: (id: string): Promise<AiProviderTestResult> => (registryInstance ??= createDefaultRegistry()).test(id),
  refreshExternal: (): Promise<AiProviderState> => (registryInstance ??= createDefaultRegistry()).refreshExternal(),
  getActivePublic: (): Promise<AiProviderPublic> => (registryInstance ??= createDefaultRegistry()).getActivePublic(),
  getActiveSecret: (): Promise<ResolvedAiProvider> => (registryInstance ??= createDefaultRegistry()).getActiveSecret(),
  executeActive: <T>(operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T> => (registryInstance ??= createDefaultRegistry()).executeActive(operation),
  execute: <T>(id: string, operation: (provider: ResolvedAiProvider) => Promise<T>): Promise<T> => (registryInstance ??= createDefaultRegistry()).execute(id, operation)
}
