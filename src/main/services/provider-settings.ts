import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { AiProviderPublicSettings, AiProviderSettingsInput } from '../../shared/contracts/ai-capability'
import { normalizeBaseUrl, ProviderError, type ProviderSecretSettings } from './openai-provider'

const BASE_URL_KEY = 'baseUrl'
const MODEL_KEY = 'model'
const ENCRYPTED_KEY = 'encryptedApiKey'

export interface ProviderSettingsStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
}

export interface SecretCrypto {
  isAvailable(): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

export class ProviderSettingsManager {
  constructor(private readonly storage: ProviderSettingsStorage, private readonly crypto: SecretCrypto) {}

  getPublic(): AiProviderPublicSettings {
    return {
      provider: 'openai-compatible',
      baseUrl: typeof this.storage.get(BASE_URL_KEY) === 'string' ? this.storage.get(BASE_URL_KEY) as string : 'https://api.openai.com/v1',
      model: typeof this.storage.get(MODEL_KEY) === 'string' ? this.storage.get(MODEL_KEY) as string : '',
      apiKeyConfigured: typeof this.storage.get(ENCRYPTED_KEY) === 'string'
    }
  }

  update(input: AiProviderSettingsInput): AiProviderPublicSettings {
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const model = input.model.trim()
    if (!model || model.length > 300) throw new ProviderError('模型名称不能为空且不能超过 300 个字符。', 'INVALID_SETTINGS')
    if (input.clearApiKey && input.apiKey) throw new ProviderError('不能同时设置和清除 API Key。', 'INVALID_SETTINGS')

    let encrypted: string | undefined
    if (input.apiKey !== undefined) {
      const apiKey = input.apiKey.trim()
      if (!apiKey || apiKey.length > 20_000) throw new ProviderError('API Key 无效。', 'INVALID_SETTINGS')
      if (!this.crypto.isAvailable()) throw new ProviderError('当前系统安全存储不可用，无法安全保存 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
      encrypted = this.crypto.encrypt(apiKey)
    }

    this.storage.set(BASE_URL_KEY, baseUrl)
    this.storage.set(MODEL_KEY, model)
    if (input.clearApiKey) this.storage.delete(ENCRYPTED_KEY)
    if (encrypted) this.storage.set(ENCRYPTED_KEY, encrypted)
    return this.getPublic()
  }

  getSecret(): ProviderSecretSettings {
    const settings = this.getPublic()
    const encrypted = this.storage.get(ENCRYPTED_KEY)
    if (!settings.model || typeof encrypted !== 'string') throw new ProviderError('AI 服务配置不完整，请先设置模型和 API Key。', 'INVALID_SETTINGS')
    if (!this.crypto.isAvailable()) throw new ProviderError('当前系统安全存储不可用，无法读取 API Key。', 'SECURE_STORAGE_UNAVAILABLE')
    try {
      return { baseUrl: settings.baseUrl, model: settings.model, apiKey: this.crypto.decrypt(encrypted) }
    } catch {
      throw new ProviderError('保存的 API Key 无法解密，请重新设置。', 'KEY_DECRYPTION_FAILED')
    }
  }
}

type StoreShape = {
  baseUrl: string
  model: string
  encryptedApiKey?: string
}

let providerSettingsInstance: ProviderSettingsManager | null = null

function getProviderSettingsManager(): ProviderSettingsManager {
  if (providerSettingsInstance) return providerSettingsInstance
  const store = new Store<StoreShape>({
    name: 'ai-provider',
    defaults: { baseUrl: 'https://api.openai.com/v1', model: '' }
  })
  const electronCrypto: SecretCrypto = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  providerSettingsInstance = new ProviderSettingsManager(store, electronCrypto)
  return providerSettingsInstance
}

export const providerSettings = {
  getPublic: (): AiProviderPublicSettings => getProviderSettingsManager().getPublic(),
  update: (input: AiProviderSettingsInput): AiProviderPublicSettings => getProviderSettingsManager().update(input),
  getSecret: (): ProviderSecretSettings => getProviderSettingsManager().getSecret()
}
